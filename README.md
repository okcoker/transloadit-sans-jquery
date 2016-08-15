# transloadit-sans-jquery
TransloadIt sdk without jQuery, and a few other things

## Why

The [original library](https://github.com/transloadit/jquery-sdk/) requires jQuery and includes a bunch of view logic that makes it easier for the library consumer to get started with the service. That's fine for most people but I'd rather not include jQuery and I don't need any modal/view logic in the code either.

## Caveats

Uses formData and includes fetch polyfill. It is also written in ES6, so you'll most likely need a bundler such as [webpack](https://github.com/webpack/webpack) to include in your project. Optionally, if you'd like a single file, you can clone this repo, run `npm i` and then `npm run build` to get a single CommonJS module file.

## Example Usage (mine at least)

```js
// This is almost the equivalent of `triggerUploadOnFileSelection: true` except I wanted to alter params before starting the upload process.
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
