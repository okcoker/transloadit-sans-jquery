# transloadit-sans-jquery
TransloadIt sdk without jQuery, and a few other things

## Why

The [original library](https://github.com/transloadit/jquery-sdk/) requires jQuery and includes a bunch of view logic that makes it easier for the library consumer to get started with the service. That's fine for most people but I'd rather not include jQuery and I don't need any modal/view logic in the code either. If you're using a bundler such as [webpack](https://github.com/webpack/webpack) or [browserify](https://github.com/substack/browserify-website), this might be easy enough for you to use.

## Caveats

Uses formData and includes fetch polyfill. As mentioned before, you'll probably need a bundler of some kind to use this.

## Installation
`npm i -S git://github.com/okcoker/transloadit-sans-jquery.git#v1.0`

Since this is just used by myself so far, and not really well tested, I haven't uploaded it to npm.

## Example Usage (mine at least)

```js

// You also could require('transloadit-sans-jquery') if that's what you're into.
import Uploader from 'transloadit-sans-jquery';

// This is almost the equivalent of `triggerUploadOnFileSelection: true` except
// I wanted to alter params before starting the upload process. You could provide
// these params when constructing `this._uploader` as well.
function handleFileSelect() {
    const params = {
        auth: {
            key: 'auth key'
        },
        'notify_url': 'http://example.com/notify_url',
        'template_id': 'your template id'
    };

    this._uploader.option('params', params);
    this._uploader.start();
}

// this._form can be an id string or the form element itself
this._uploader = new Uploader(this._form, {
    autoSubmit: false,
    onFileSelect: handleFileSelect,
    onStart() {
        console.log('onStart', arguments);
    },
    onProgress() {
        console.log('onProgress', arguments);
    },
    onUpload() {
        console.log('onUpload', arguments);
    },
    onResult() {
        console.log('onResult', arguments);
    },
    onError() {
        console.log('onError', arguments);
    },
    onSuccess() {
        console.log('onSuccess', arguments);
    }
});
```
