function Acute(success, error, init, validate) {
    //
    if (!success) {
        success = function () {
            // default success
        }
    }
    
    if (!error) {
        function defaultError() {
            error = function (err) {
                console.log(err)
            }
        }
    }
    
    this.ajax = function ajax(el, options) {
        
    }
}