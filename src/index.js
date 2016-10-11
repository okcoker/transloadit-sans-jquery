// small jsonp lib
// https://github.com/camsong/fetch-jsonp/
import fetchJSONP from 'fetch-jsonp';

// https://github.com/matthew-andrews/isomorphic-fetch
require('isomorphic-fetch');

export const ASSEMBLY_UPLOADING = 'ASSEMBLY_UPLOADING';
export const ASSEMBLY_EXECUTING = 'ASSEMBLY_EXECUTING';
export const ASSEMBLY_CANCELED = 'ASSEMBLY_CANCELED';
export const ASSEMBLY_COMPLETED = 'ASSEMBLY_COMPLETED';

let PROTOCOL = 'https://';

if (typeof document !== 'undefined') {
    PROTOCOL = (document.location.protocol === 'https:') ? 'https://' : 'http://';
}

var DEFAULT_SERVICE = PROTOCOL + 'api2.transloadit.com/';

function timedFetch(fetch, timeout) {
    return Promise.race([
        fetch,
        new Promise((resolve) => setTimeout(() => resolve('timeout'), timeout))
    ]);
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
    Element.prototype.matches =
    Element.prototype.matchesSelector ||
    Element.prototype.mozMatchesSelector ||
    Element.prototype.msMatchesSelector ||
    Element.prototype.oMatchesSelector ||
    Element.prototype.webkitMatchesSelector ||
    function(s) {
        var matches = (this.document || this.ownerDocument).querySelectorAll(s),
            i = matches.length;
        while (--i >= 0 && matches.item(i) !== this) {} // eslint-disable-line no-empty
        return i > -1;
    };
}

export default class Uploader {
    constructor(form, options) {
        this.timers = {};
        this._options = {
            service: DEFAULT_SERVICE,
            assets: PROTOCOL + 'assets.transloadit.com/',
            beforeStart() {
                return true;
            },
            onFileSelect() {},
            onStart() {},
            onProgress() {},
            onUpload() {},
            onResult() {},
            onCancel() {},
            onError() {},
            onSuccess() {},
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
        this._ended = {};
        this.pollStarted = null;
        this.pollRetries = 0;
        this.started = {};
        this.assemblyMap = {};
        this.params = null;
        this._assemblyInstanceMap = {};

        this.paramsElement = null;
        this.form = null;
        this.files = null;

        this._lastMSecs = 0;
        this._lastNSecs = 0;
        this._clockseq = 0;

        this._uploadFileIds = [];
        this._resultFileIds = [];

        this.init(form, options);
    }

    options(opts) {
        if (arguments.length === 0) {
            return this._options;
        }

        this._options = {
            ...this._options,
            ...opts
        };

        return this._options;
    }

    option(key, val) {
        if (arguments.length === 1) {
            return this._options[key];
        }

        this._options[key] = val;

        return val;
    }

    init(form, options = {}) {
        this.form = form;

        if (typeof form === 'string') {
            this.form = document.getElementById(form);
        }

        this.options({
            ...options
        });

        this.form.addEventListener('submit.transloadit', this._handleFormSubmit, false);

        const input = this.form.querySelector('input[type="file"]');

        if (this._options.triggerUploadOnFileSelection) {
            input.addEventListener('change', (e) => {
                this.start(e);
            }, false);
        }

        input.addEventListener('change', (e) => {
            this._options.onFileSelect(e.target.value, e);
        }, false);
    }

    start(e) {
        const event = document.createEvent('CustomEvent');
        event.initCustomEvent('submit.transloadit', true, true, {
            srcOfEvent: e
        });
        this.form.dispatchEvent(event);
    }

    getBoredInstance() {
        var self = this;

        var url = `${this._options.service}instances/bored`;
        var canUseCustomBoredLogic = true;

        function proceed() {
            fetchJSONP(url, {
                timeout: self._options.pollTimeout
            })
            .then((response) => response.json())
            .then((instance) => {
                if (instance.error) {
                    instance.url = url;
                    self._options.onError(instance);
                    return;
                }

                self.startPoll(instance.api2_host);
                return;
            })
            .catch((jsonpErr) => {
                if (canUseCustomBoredLogic && self._options.service === DEFAULT_SERVICE) {
                    canUseCustomBoredLogic = false;

                    self._findBoredInstanceUrl()
                    .then((theUrl) => {
                        url = PROTOCOL + 'api2.' + theUrl + '/instances/bored';

                        if (PROTOCOL === 'https://') {
                            url = PROTOCOL + 'api2-' + theUrl + '/instances/bored';
                        }

                        return proceed();
                    })
                    .catch((err) => {
                        err = {
                            error: 'BORED_INSTANCE_ERROR'
                        };
                        self._options.onError(err);
                    });

                    return;
                }

                var reason = `JSONP bored instance request status: ${status}`;
                reason += ', err: ' + jsonpErr;

                var err = {
                    error: 'CONNECTION_ERROR',
                    reason,
                    url
                };
                self._options.onError(err);
            });
        }

        proceed();
    }

    startPoll(instance) {
        this.pollRetries = 0;
        this.uploads = [];
        this._uploadFileIds = [];
        this._resultFileIds = [];
        this.results = {};

        const assemblyId = this._genUuid();

        this.started[assemblyId] = false;
        this._ended[assemblyId] = false;
        this._assemblyInstanceMap[assemblyId] = instance;

        const url = PROTOCOL + instance + '/assemblies/' + assemblyId + '?redirect=false';
        let assemblyParams = this._options.params;

        if (this.paramsElement) {
            assemblyParams = this.paramsElement.value;
        }

        if (!(this._options.formData instanceof FormData)) {
            this._options.formData = new FormData(this.form);
        }

        this._options.formData.append('params', JSON.stringify(assemblyParams));

        if (this._options.formData) {
            for (let i = 0; i < this._options.formData.length; i++) {
                const tupel = this._options.formData[i];
                this._options.formData.append(tupel[0], tupel[1], tupel[2]);
            }
        }

        fetch(url, {
            method: 'post',
            body: this._options.formData
        });

        setTimeout(() => this._poll({ assemblyId, instance }), 300);
    }

    detectFileInputs() {
        let files = Array.from(this.form
            .querySelectorAll('input[type=file]'))
            .filter((i) => !this._options.exclude || i.matches(this._options.exclude));

        if (!this._options.processZeroFiles) {
            files = files.filter(function() {
                return this.value !== '';
            });
        }

        this.files = files;
    }

    validate() {
        if (!this._options.params) {
            const paramsElement = this.form.querySelector('input[name=params]');

            if (!paramsElement) {
                console.error('Could not find input[name=params] in your form.');
                return;
            }

            this.paramsElement = paramsElement;
            try {
                this.params = JSON.parse(paramsElement.value);
            }
            catch (e) {
                console.error('Error: input[name=params] seems to contain invalid JSON.');
                return;
            }
        }
        else {
            this.params = this._options.params;
        }

        if (this.params.redirect_url) {
            this.form.setAttribute('action', this.params.redirect_url);
        }
        else if (this._options.autoSubmit && (this.form.getAttribute('action') === this._options.service + 'assemblies')) {
            console.error('Error: input[name=params] does not include a redirect_url');
            return;
        }
    }

    stop(assemblyId) {
        this._ended[assemblyId] = true;
    }

    cancel(assemblyId) {
        if (this._ended[assemblyId]) {
            return;
        }

        if (this.paramsElement) {
            this.paramsElement.insertBefore(this.form, this.paramsElement.firstChild);
        }

        clearTimeout(this.timers[assemblyId]);

        const instance = this._assemblyInstanceMap[assemblyId];

        this._poll({ query: '?method=delete', assemblyId, instance });

        setTimeout(() => {
            delete this._assemblyInstanceMap[assemblyId];
            delete this._ended[assemblyId];
        }, 500);
    }

    submitForm() {
        // prevent that files are uploaded to the final destination
        // after all that is what we use this plugin for :)
        if (this.form.getAttribute('enctype') === 'multipart/form-data') {
            this.form.removeAttribute('enctype');
        }

        if (this.assembly !== null) {
            const textarea = document.createElement('textarea');
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

    _handleFormSubmit = () => {
        this.validate();
        this.detectFileInputs();

        if (!this._options.processZeroFiles && this.files.length === 0) {
            if (this._options.beforeStart()) {
                this.submitForm();
            }
        }
        else if (this._options.beforeStart()) {
            this.getBoredInstance();
        }

        return false;
    }

    _findBoredInstanceUrl() {
        const self = this;
        const region = this._options.region;
        const timeout = 5000;
        let domain = 's3';

        if (region !== 'us-east-1') {
            domain = 's3-' + region;
        }

        const url = `${PROTOCOL}${domain}.amazonaws.com/infra-${region}.transloadit.com/cached_instances.json`;

        function success(result) {
            var instances = shuffle(result.uploaders);
            return self._findResponsiveInstance(instances, 0);
        }

        function backupFetch() {
            // retry from the crm if S3 let us down
            const backupUrl = `${PROTOCOL}transloadit.com/${region}_cached_instances.json`;
            const backupResult = fetch(backupUrl).then((res) => res.json());

            return timedFetch(backupResult, timeout)
                .then(success);
        }

        const result = fetch(url).then((res) => res.json());
        return timedFetch(result, timeout)
            .then(success)
            .catch(backupFetch);
    }

    _findResponsiveInstance(instances, index) {
        return new Promise((resolve, reject) => {
            if (!instances[index]) {
                const err = new Error('No responsive uploaders');
                reject(err);
                return;
            }

            const url = instances[index];

            fetchJSONP(`${PROTOCOL}${url}`, {
                timeout: 3000
            })
            .then((res) => res.json())
            .then(() => resolve(url))
            .catch(() => this._findResponsiveInstance(instances, index + 1));
        });
    }

    _poll(options = {}) {
        const { query, assemblyId, instance } = options;
        if (this._ended[assemblyId]) {
            return;
        }

        if (!assemblyId || !instance) {
            console.warn('No assemblyId or instance found', assemblyId, instance);
            console.trace();
        }

        this.pollStarted = +new Date();

        const instanceId = `status-${instance}`;
        let url = `${PROTOCOL}${instanceId}${/assemblies/}${assemblyId}`;

        if (query) {
            url += query;
        }

        fetchJSONP(url, {
            timeout: this._options.pollTimeout
        })
        .then((res) => res.json())
        .then((assembly) => {
            if (this._ended[assemblyId]) {
                return;
            }

            this.assembly = assembly;
            if (assembly.error === 'ASSEMBLY_NOT_FOUND') {
                this.pollRetries++;

                if (this.pollRetries > this._options.poll404Retries) {
                    this._ended[assemblyId] = true;
                    this._options.onError(assembly);
                    return;
                }

                setTimeout(() => this._poll(options), 400);
                return;
            }

            if (assembly.error) {
                this._ended[assemblyId] = true;
                this._options.onError(assembly);
                return;
            }

            if (!this.started[assemblyId] && assembly.bytes_expected > 0) {
                this.started[assemblyId] = true;
                this._options.onStart(assembly);
            }

            this.pollRetries = 0;
            // var isUploading = assembly.ok === ASSEMBLY_UPLOADING;
            var isExecuting = assembly.ok === ASSEMBLY_EXECUTING;
            var isCanceled = assembly.ok === ASSEMBLY_CANCELED;
            var isComplete = assembly.ok === ASSEMBLY_COMPLETED;

            if (assembly.bytes_expected > 0) {
                this._options.onProgress(assembly.bytes_received, assembly.bytes_expected, assembly);
            }

            for (var i = 0; i < assembly.uploads.length; i++) {
                var upload = assembly.uploads[i];

                if (this._uploadFileIds.indexOf(upload.id) === -1) {
                    this._options.onUpload(upload, assembly);
                    this.uploads.push(upload);
                    this._uploadFileIds.push(upload.id);
                }
            }

            for (var step in assembly.results) {
                this.results[step] = this.results[step] || [];

                for (var j = 0; j < assembly.results[step].length; j++) {
                    var result = assembly.results[step][j];
                    var resultId = step + '_' + result.id;

                    if (this._resultFileIds.indexOf(resultId) === -1) {
                        this._options.onResult(step, result, assembly);
                        this.results[step].push(result);
                        this._resultFileIds.push(resultId);
                    }
                }
            }

            if (isCanceled) {
                this._ended[assemblyId] = true;
                this._options.onCancel(assembly);
                return;
            }

            var isEnded = isComplete || (!this._options.wait && isExecuting);

            if (isEnded) {
                this._ended[assemblyId] = true;
                assembly.uploads = this.uploads;
                assembly.results = this.results;
                this._options.onSuccess(assembly);

                // give the progressbar some time to finish to 100%
                setTimeout(() => this.submitForm(), 600);
                return;
            }

            var ping = this.pollStarted - +new Date();
            var timeout = ping < this._options.interval ? this._options.interval : ping;

            this.timers[assemblyId] = setTimeout(() => this._poll(options), timeout);
            return;
        })
        .catch((jsonpErr) => {
            if (this._ended[assemblyId]) {
                return;
            }

            this.pollRetries++;
            if (this.pollRetries > this._options.pollConnectionRetries) {
                this._ended[assemblyId] = true;

                var reason = 'JSONP status poll request status: ' + status;
                reason += ', err: ' + jsonpErr;

                var err = {
                    error: 'CONNECTION_ERROR',
                    reason,
                    url
                };
                this._options.onError(err);
                return;
            }

            setTimeout(() => this._poll(options), 350);
        });
    }

    _genUuid(options, buf, offset) {
        options = options || {};

        var i = buf && offset || 0;
        var b = buf || [];

        var _rnds = new Array(16);
        var _rng = function() {
            for (var j = 0, r; j < 16; j++) {
                if ((j & 0x03) === 0) {
                    r = Math.random() * 0x100000000;
                }
                _rnds[j] = r >>> ((j & 0x03) << 3) & 0xff;
            }

            return _rnds;
        };
        var _seedBytes = _rng();

        var _nodeId = [
            _seedBytes[0] | 0x01,
            _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]
        ];

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
        var dt = (msecs - this._lastMSecs) + (nsecs - this._lastNSecs) / 10000;

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
        var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
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
            var k = bufferOffset || 0, bth = _byteToHex;

            return bth[_buf[k++]] + bth[_buf[k++]] +
                            bth[_buf[k++]] + bth[_buf[k++]] +
                            bth[_buf[k++]] + bth[_buf[k++]] +
                            bth[_buf[k++]] + bth[_buf[k++]] +
                            bth[_buf[k++]] + bth[_buf[k++]] +
                            bth[_buf[k++]] + bth[_buf[k++]] +
                            bth[_buf[k++]] + bth[_buf[k++]] +
                            bth[_buf[k++]] + bth[_buf[k++]];
        }

        return buf ? buf : unparse(b);
    }
}

