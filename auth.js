/* auth.js - PIN por rol - JV International */
(function () {
  'use strict';

  var KEY = 'jv_pin';
  var API_PREFIX = 'https://script.google.com/macros/';
  var nativeFetch = window.fetch.bind(window);

  function getPin() {
    var p = '';
    try { p = sessionStorage.getItem(KEY) || ''; } catch (e) {}
    if (!p) {
      p = String(window.prompt('PIN de acceso:') || '').trim();
      if (p) { try { sessionStorage.setItem(KEY, p); } catch (e) {} }
    }
    return p;
  }

  function clearPin() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }

  window.fetch = function (input, init) {

    var url = typeof input === 'string' ? input : ((input && input.url) || '');

    if (url.indexOf(API_PREFIX) !== 0) {
      return nativeFetch(input, init);
    }

    var pin = getPin();
    var options = init ? Object.assign({}, init) : {};
    var target = input;

    if (typeof input === 'string' && pin) {

      var isPost = options.method && String(options.method).toUpperCase() === 'POST';

      if (isPost) {

        var b = options.body;

        if (typeof b === 'string') {
          options.body = b + (b ? '&' : '') + 'pin=' + encodeURIComponent(pin);
        } else if (b instanceof URLSearchParams) {
          var copy = new URLSearchParams(b);
          copy.append('pin', pin);
          options.body = copy;
        }

      } else {
        target = input + (input.indexOf('?') >= 0 ? '&' : '?') + 'pin=' + encodeURIComponent(pin);
      }

    }

    return nativeFetch(target, options).then(function (res) {
      try {
        res.clone().json().then(function (d) {
          if (d && d.ok === false && /^PIN/.test(String(d.error || ''))) clearPin();
        }).catch(function () {});
      } catch (e) {}
      return res;
    });

  };

})();
