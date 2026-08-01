/* global document, localStorage */

try {
  var hint = JSON.parse(localStorage.getItem('ch-appearance-hint') || 'null')
  if (hint) {
    var root = document.documentElement
    for (var key in hint) root.setAttribute(key, hint[key])
  }
} catch {
  // Missing or invalid cache falls back to the default theme.
}
