'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.ASSEMBLY_COMPLETED = exports.ASSEMBLY_CANCELED = exports.ASSEMBLY_EXECUTING = exports.ASSEMBLY_UPLOADING = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // small jsonp lib
// https://github.com/camsong/fetch-jsonp/


var _fetchJsonp = require('fetch-jsonp');

var _fetchJsonp2 = _interopRequireDefault(_fetchJsonp);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// https://github.com/matthew-andrews/isomorphic-fetch
require('isomorphic-fetch');

var ASSEMBLY_UPLOADING = exports.ASSEMBLY_UPLOADING = 'ASSEMBLY_UPLOADING';
var ASSEMBLY_EXECUTING = exports.ASSEMBLY_EXECUTING = 'ASSEMBLY_EXECUTING';
var ASSEMBLY_CANCELED = exports.ASSEMBLY_CANCELED = 'ASSEMBLY_CANCELED';
var ASSEMBLY_COMPLETED = exports.ASSEMBLY_COMPLETED = 'ASSEMBLY_COMPLETED';

var PROTOCOL = 'https://';

if (typeof document !== 'undefined') {
    PROTOCOL = document.location.protocol === 'https:' ? 'https://' : 'http://';
}

var DEFAULT_SERVICE = PROTOCOL + 'api2.transloadit.com/';

function timedFetch(fetch, timeout) {
    return Promise.race([fetch, new Promise(function (resolve) {
        return setTimeout(function () {
            return resolve('timeout');
        }, timeout);
    })]);
}

function shuffle(arr) {
    var shuffled = [];
    var rand;
    for (var i = 0; i < arr.length; i++) {
        rand = Math.floor(Math.random() * (i + 1));
        shuffled[i] = shuffled[rand];
        shuffled[rand] = arr[i];
    }
    return shuffled;
}

if (typeof Element !== 'undefined' && !Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.matchesSelector || Element.prototype.mozMatchesSelector || Element.prototype.msMatchesSelector || Element.prototype.oMatchesSelector || Element.prototype.webkitMatchesSelector || function (s) {
        var matches = (this.document || this.ownerDocument).querySelectorAll(s),
            i = matches.length;
        while (--i >= 0 && matches.item(i) !== this) {} // eslint-disable-line no-empty
        return i > -1;
    };
}

var Uploader = function () {
    function Uploader(form, options) {
        var _this = this;

        _classCallCheck(this, Uploader);

        this._handleFormSubmit = function () {
            _this.validate();
            _this.detectFileInputs();

            if (!_this._options.processZeroFiles && _this.files.length === 0) {
                if (_this._options.beforeStart()) {
                    _this.submitForm();
                }
            } else if (_this._options.beforeStart()) {
                _this.getBoredInstance();
            }

            return false;
        };

        this.assemblyId = null;

        this.instance = null;
        this.documentTitle = null;
        this.timer = null;
        this._options = {
            service: DEFAULT_SERVICE,
            assets: PROTOCOL + 'assets.transloadit.com/',
            beforeStart: function beforeStart() {
                return true;
            },
            onFileSelect: function onFileSelect() {},
            onStart: function onStart() {},
            onProgress: function onProgress() {},
            onUpload: function onUpload() {},
            onResult: function onResult() {},
            onCancel: function onCancel() {},
            onError: function onError() {},
            onSuccess: function onSuccess() {},

            interval: 2500,
            pollTimeout: 8000,
            poll404Retries: 15,
            pollConnectionRetries: 5,
            wait: false,
            processZeroFiles: true,
            triggerUploadOnFileSelection: false,
            autoSubmit: true,
            exclude: '',
            fields: false,
            params: null,
            signature: null,
            region: 'us-east-1',
            debug: true
        };
        this.uploads = [];
        this.results = {};
        this.ended = null;
        this.pollStarted = null;
        this.pollRetries = 0;
        this.started = false;
        this.assembly = null;
        this.params = null;

        this.bytesReceivedBefore = 0;

        this.paramsElement = null;
        this.form = null;
        this.files = null;
        this.iframe = null;

        this._lastPoll = 0;
        this._lastMSecs = 0;
        this._lastNSecs = 0;
        this._clockseq = 0;

        this._uploadFileIds = [];
        this._resultFileIds = [];

        this.init(form, options);
    }

    _createClass(Uploader, [{
        key: 'options',
        value: function options(opts) {
            if (arguments.length === 0) {
                return this._options;
            }

            this._options = _extends({}, this._options, opts);

            return this._options;
        }
    }, {
        key: 'option',
        value: function option(key, val) {
            if (arguments.length === 1) {
                return this._options[key];
            }

            this._options[key] = val;

            return val;
        }
    }, {
        key: 'init',
        value: function init(form) {
            var _this2 = this;

            var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

            this.form = form;

            if (typeof form === 'string') {
                this.form = document.getElementById(form);
            }

            this.options(_extends({}, options));

            this.form.addEventListener('submit.transloadit', this._handleFormSubmit, false);

            var input = this.form.querySelector('input[type="file"]');

            if (this._options.triggerUploadOnFileSelection) {
                input.addEventListener('change', function (e) {
                    _this2.start(e);
                }, false);
            }

            input.addEventListener('change', function (e) {
                _this2._options.onFileSelect(e.target.value, e);
            }, false);
        }
    }, {
        key: 'start',
        value: function start(e) {
            var event = document.createEvent('CustomEvent');
            event.initCustomEvent('submit.transloadit', true, true, {
                srcOfEvent: e
            });
            this.form.dispatchEvent(event);
        }
    }, {
        key: 'getBoredInstance',
        value: function getBoredInstance() {
            var self = this;

            this.instance = null;
            var url = this._options.service + 'instances/bored';
            var canUseCustomBoredLogic = true;

            function proceed() {
                (0, _fetchJsonp2.default)(url, {
                    timeout: self._options.pollTimeout
                }).then(function (response) {
                    return response.json();
                }).then(function (instance) {
                    if (instance.error) {
                        self.ended = true;
                        instance.url = url;
                        self._options.onError(instance);
                        return;
                    }

                    self.instance = instance.api2_host;
                    self.startPoll();
                    return;
                }).catch(function (jsonpErr) {
                    if (canUseCustomBoredLogic && self._options.service === DEFAULT_SERVICE) {
                        canUseCustomBoredLogic = false;

                        self._findBoredInstanceUrl().then(function (theUrl) {
                            url = PROTOCOL + 'api2.' + theUrl + '/instances/bored';

                            if (PROTOCOL === 'https://') {
                                url = PROTOCOL + 'api2-' + theUrl + '/instances/bored';
                            }

                            return proceed();
                        }).catch(function (err) {
                            self.ended = true;
                            err = {
                                error: 'BORED_INSTANCE_ERROR'
                            };
                            self._options.onError(err);
                        });

                        return;
                    }

                    self.ended = true;

                    var reason = 'JSONP bored instance request status: ' + status;
                    reason += ', err: ' + jsonpErr;

                    var err = {
                        error: 'CONNECTION_ERROR',
                        reason: reason,
                        url: url
                    };
                    self._options.onError(err);
                });
            }

            proceed();
        }
    }, {
        key: 'startPoll',
        value: function startPoll() {
            var _this3 = this;

            this.started = false;
            this.ended = false;
            this.bytesReceivedBefore = 0;
            this.pollRetries = 0;
            this.uploads = [];
            this._uploadFileIds = [];
            this._resultFileIds = [];
            this.results = {};

            this.assemblyId = this._genUuid();

            this.iframe = document.createElement('iframe');
            this.iframe.id = 'transloadit-' + this.assemblyId;
            this.iframe.name = 'transloadit-' + this.assemblyId;
            this.iframe.style.display = 'none';

            document.body.appendChild(this.iframe);

            var url = PROTOCOL + this.instance + '/assemblies/' + this.assemblyId + '?redirect=false';
            var assemblyParams = this._options.params;

            if (this.paramsElement) {
                assemblyParams = this.paramsElement.value;
            }

            if (!(this._options.formData instanceof FormData)) {
                this._options.formData = new FormData(this.form);
            }

            this._options.formData.append('params', JSON.stringify(assemblyParams));

            if (this._options.formData) {
                for (var i = 0; i < this._options.formData.length; i++) {
                    var tupel = this._options.formData[i];
                    this._options.formData.append(tupel[0], tupel[1], tupel[2]);
                }
            }

            fetch(url, {
                method: 'post',
                body: this._options.formData
            });

            this._lastPoll = +new Date();
            setTimeout(function () {
                return _this3._poll();
            }, 300);
        }
    }, {
        key: 'detectFileInputs',
        value: function detectFileInputs() {
            var _this4 = this;

            var files = Array.from(this.form.querySelectorAll('input[type=file]')).filter(function (i) {
                return !_this4._options.exclude || i.matches(_this4._options.exclude);
            });

            if (!this._options.processZeroFiles) {
                files = files.filter(function () {
                    return this.value !== '';
                });
            }

            this.files = files;
        }
    }, {
        key: 'validate',
        value: function validate() {
            if (!this._options.params) {
                var paramsElement = this.form.querySelector('input[name=params]');

                if (!paramsElement) {
                    console.error('Could not find input[name=params] in your form.');
                    return;
                }

                this.paramsElement = paramsElement;
                try {
                    this.params = JSON.parse(paramsElement.value);
                } catch (e) {
                    console.error('Error: input[name=params] seems to contain invalid JSON.');
                    return;
                }
            } else {
                this.params = this._options.params;
            }

            if (this.params.redirect_url) {
                this.form.setAttribute('action', this.params.redirect_url);
            } else if (this._options.autoSubmit && this.form.getAttribute('action') === this._options.service + 'assemblies') {
                console.error('Error: input[name=params] does not include a redirect_url');
                return;
            }
        }
    }, {
        key: 'stop',
        value: function stop() {
            this.ended = true;
        }
    }, {
        key: 'cancel',
        value: function cancel() {
            var _this5 = this;

            if (this.ended) {
                return;
            }

            if (this.paramsElement) {
                this.paramsElement.insertBefore(this.form, this.paramsElement.firstChild);
            }

            clearTimeout(this.timer);

            this._poll('?method=delete');

            if (navigator.appName === 'Microsoft Internet Explorer') {
                this.iframe.contentWindow.document.execCommand('Stop');
            }

            setTimeout(function () {
                return _this5.iframe.parentNode.removeChild(_this5.iframe);
            }, 500);
        }
    }, {
        key: 'submitForm',
        value: function submitForm() {
            // prevent that files are uploaded to the final destination
            // after all that is what we use this plugin for :)
            if (this.form.getAttribute('enctype') === 'multipart/form-data') {
                this.form.removeAttribute('enctype');
            }

            if (this.assembly !== null) {
                var textarea = document.createElement('textarea');
                textarea.name = 'transloadit';
                textarea.value = JSON.stringify(this.assembly);
                textarea.style.display = 'none';
                this.form.appendChild(textarea);
            }

            if (this._options.autoSubmit) {
                this.form.removeEventListener('submit.transloadit', this._handleFormSubmit);
                this.form.submit();
            }
        }
    }, {
        key: 'getUTCDatetime',
        value: function getUTCDatetime() {
            var now = new Date();
            var d = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());

            var pad = function pad(n) {
                return n < 10 ? '0' + n : n;
            };
            var tz = d.getTimezoneOffset();
            var tzs = (tz > 0 ? '-' : '+') + pad(parseInt(tz / 60, 10));

            if (tz % 60 !== 0) {
                tzs += pad(tz % 60);
            }

            if (tz === 0) {
                tzs = 'Z';
            }

            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + tzs;
        }
    }, {
        key: '_findBoredInstanceUrl',
        value: function _findBoredInstanceUrl() {
            var self = this;
            var region = this._options.region;
            var timeout = 5000;
            var domain = 's3';

            if (region !== 'us-east-1') {
                domain = 's3-' + region;
            }

            var url = '' + PROTOCOL + domain + '.amazonaws.com/infra-' + region + '.transloadit.com/cached_instances.json';

            function success(result) {
                var instances = shuffle(result.uploaders);
                return self._findResponsiveInstance(instances, 0);
            }

            function backupFetch() {
                // retry from the crm if S3 let us down
                var backupUrl = PROTOCOL + 'transloadit.com/' + region + '_cached_instances.json';
                var backupResult = fetch(backupUrl).then(function (res) {
                    return res.json();
                });

                return timedFetch(backupResult, timeout).then(success);
            }

            var result = fetch(url).then(function (res) {
                return res.json();
            });
            return timedFetch(result, timeout).then(success).catch(backupFetch);
        }
    }, {
        key: '_findResponsiveInstance',
        value: function _findResponsiveInstance(instances, index) {
            var _this6 = this;

            return new Promise(function (resolve, reject) {
                if (!instances[index]) {
                    var err = new Error('No responsive uploaders');
                    reject(err);
                    return;
                }

                var url = instances[index];

                (0, _fetchJsonp2.default)('' + PROTOCOL + url, {
                    timeout: 3000
                }).then(function (res) {
                    return res.json();
                }).then(function () {
                    return resolve(url);
                }).catch(function () {
                    return _this6._findResponsiveInstance(instances, index + 1);
                });
            });
        }
    }, {
        key: '_poll',
        value: function _poll(query) {
            var _this7 = this;

            if (this.ended) {
                return;
            }

            this.pollStarted = +new Date();

            var instance = 'status-' + this.instance;
            var url = '' + PROTOCOL + instance + /assemblies/ + this.assemblyId;

            if (query) {
                url += query;
            }

            (0, _fetchJsonp2.default)(url, {
                timeout: this._options.pollTimeout
            }).then(function (res) {
                return res.json();
            }).then(function (assembly) {
                if (_this7.ended) {
                    return;
                }

                _this7.assembly = assembly;
                if (assembly.error === 'ASSEMBLY_NOT_FOUND') {
                    _this7.pollRetries++;

                    if (_this7.pollRetries > _this7._options.poll404Retries) {
                        _this7.ended = true;
                        _this7._options.onError(assembly);
                        return;
                    }

                    setTimeout(function () {
                        return _this7._poll();
                    }, 400);
                    return;
                }
                if (assembly.error) {
                    _this7.ended = true;
                    _this7._options.onError(assembly);
                    return;
                }

                if (!_this7.started && assembly.bytes_expected > 0) {
                    _this7.started = true;
                    _this7._options.onStart(assembly);
                }

                _this7.pollRetries = 0;
                // var isUploading = assembly.ok === ASSEMBLY_UPLOADING;
                var isExecuting = assembly.ok === ASSEMBLY_EXECUTING;
                var isCanceled = assembly.ok === ASSEMBLY_CANCELED;
                var isComplete = assembly.ok === ASSEMBLY_COMPLETED;

                if (assembly.bytes_expected > 0) {
                    _this7._options.onProgress(assembly.bytes_received, assembly.bytes_expected, assembly);
                }

                for (var i = 0; i < assembly.uploads.length; i++) {
                    var upload = assembly.uploads[i];

                    if (_this7._uploadFileIds.indexOf(upload.id) === -1) {
                        _this7._options.onUpload(upload, assembly);
                        _this7.uploads.push(upload);
                        _this7._uploadFileIds.push(upload.id);
                    }
                }

                for (var step in assembly.results) {
                    _this7.results[step] = _this7.results[step] || [];

                    for (var j = 0; j < assembly.results[step].length; j++) {
                        var result = assembly.results[step][j];
                        var resultId = step + '_' + result.id;

                        if (_this7._resultFileIds.indexOf(resultId) === -1) {
                            _this7._options.onResult(step, result, assembly);
                            _this7.results[step].push(result);
                            _this7._resultFileIds.push(resultId);
                        }
                    }
                }

                if (isCanceled) {
                    _this7.ended = true;
                    _this7._options.onCancel(assembly);
                    return;
                }

                var isEnded = isComplete || !_this7._options.wait && isExecuting;

                if (isEnded) {
                    _this7.ended = true;
                    assembly.uploads = _this7.uploads;
                    assembly.results = _this7.results;
                    _this7._options.onSuccess(assembly);

                    // give the progressbar some time to finish to 100%
                    setTimeout(function () {
                        return _this7.submitForm();
                    }, 600);
                    return;
                }

                var ping = _this7.pollStarted - +new Date();
                var timeout = ping < _this7._options.interval ? _this7._options.interval : ping;

                _this7.timer = setTimeout(function () {
                    return _this7._poll();
                }, timeout);
                _this7.lastPoll = +new Date();
                return;
            }).catch(function (jsonpErr) {
                if (_this7.ended) {
                    return;
                }

                _this7.pollRetries++;
                if (_this7.pollRetries > _this7._options.pollConnectionRetries) {
                    _this7.ended = true;

                    var reason = 'JSONP status poll request status: ' + status;
                    reason += ', err: ' + jsonpErr;

                    var err = {
                        error: 'CONNECTION_ERROR',
                        reason: reason,
                        url: url
                    };
                    _this7._options.onError(err);
                    return;
                }

                setTimeout(function () {
                    return _this7._poll();
                }, 350);
            });
        }
    }, {
        key: '_duration',
        value: function _duration(t) {
            var min = 60;
            var h = 60 * min;
            var hours = Math.floor(t / h);

            t -= hours * h;

            var minutes = Math.floor(t / min);
            t -= minutes * min;

            var r = '';
            if (hours > 0) {
                r += hours + 'h ';
            }
            if (minutes > 0) {
                r += minutes + 'min ';
            }
            if (t > 0) {
                t = t.toFixed(0);
                r += t + 's';
            }

            if (r === '') {
                r = '0s';
            }

            return r;
        }
    }, {
        key: '_genUuid',
        value: function _genUuid(options, buf, offset) {
            options = options || {};

            var i = buf && offset || 0;
            var b = buf || [];

            var _rnds = new Array(16);
            var _rng = function _rng() {
                for (var j = 0, r; j < 16; j++) {
                    if ((j & 0x03) === 0) {
                        r = Math.random() * 0x100000000;
                    }
                    _rnds[j] = r >>> ((j & 0x03) << 3) & 0xff;
                }

                return _rnds;
            };
            var _seedBytes = _rng();

            var _nodeId = [_seedBytes[0] | 0x01, _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]];

            this._clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;
            var clockseq = options.clockseq !== null ? options.clockseq : this._clockseq;

            var _byteToHex = [];
            var _hexToByte = {};
            for (var j = 0; j < 256; j++) {
                _byteToHex[j] = (j + 0x100).toString(16).substr(1);
                _hexToByte[_byteToHex[j]] = j;
            }

            // UUID timestamps are 100 nano-second units since the Gregorian epoch,
            // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
            // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
            // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
            var msecs = options.msecs !== null ? options.msecs : new Date().getTime();

            // Per 4.2.1.2, use count of uuid's generated during the current clock
            // cycle to simulate higher resolution clock
            var nsecs = options.nsecs !== null ? options.nsecs : this._lastNSecs + 1;

            // Time since last uuid creation (in msecs)
            var dt = msecs - this._lastMSecs + (nsecs - this._lastNSecs) / 10000;

            // Per 4.2.1.2, Bump clockseq on clock regression
            if (dt < 0 && options.clockseq === null) {
                clockseq = clockseq + 1 & 0x3fff;
            }

            // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
            // time interval
            if ((dt < 0 || msecs > this._lastMSecs) && options.nsecs === null) {
                nsecs = 0;
            }

            // Per 4.2.1.2 Throw error if too many uuids are requested
            if (nsecs >= 10000) {
                throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
            }

            this._lastMSecs = msecs;
            this._lastNSecs = nsecs;
            this._clockseq = clockseq;

            // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
            msecs += 12219292800000;

            // `time_low`
            var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
            b[i++] = tl >>> 24 & 0xff;
            b[i++] = tl >>> 16 & 0xff;
            b[i++] = tl >>> 8 & 0xff;
            b[i++] = tl & 0xff;

            // `time_mid`
            var tmh = msecs / 0x100000000 * 10000 & 0xfffffff;
            b[i++] = tmh >>> 8 & 0xff;
            b[i++] = tmh & 0xff;

            // `time_high_and_version`
            b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
            b[i++] = tmh >>> 16 & 0xff;

            // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
            b[i++] = clockseq >>> 8 | 0x80;

            // `clock_seq_low`
            b[i++] = clockseq & 0xff;

            // `node`
            var node = options.node || _nodeId;

            for (var n = 0; n < 6; n++) {
                b[i + n] = node[n];
            }

            function unparse(_buf, bufferOffset) {
                var k = bufferOffset || 0,
                    bth = _byteToHex;

                return bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]] + bth[_buf[k++]];
            }

            return buf ? buf : unparse(b);
        }
    }]);

    return Uploader;
}();

exports.default = Uploader;
