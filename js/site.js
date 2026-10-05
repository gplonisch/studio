/**
 * Shared behaviour for every site built with this kit.
 *
 * Two things only: the navigation disclosure below 720px, and client-side form
 * validation with inline errors. Both degrade to something usable with
 * JavaScript off, because a restaurant's booking form is not the place to
 * discover that a browser extension broke your page.
 *
 * Nothing here is page-specific. Forms opt in with data-validate and declare
 * their own fields; the script reads the markup rather than carrying a list.
 */

(function () {
  "use strict";

  /* ---- navigation ---------------------------------------------------- */
  var toggle = document.querySelector(".nav__toggle");
  var links = toggle && document.getElementById(toggle.getAttribute("aria-controls"));

  if (toggle && links) {
    var narrow = window.matchMedia("(max-width: 720px)");

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      links.style.display = narrow.matches ? (open ? "" : "none") : "";
    }

    setOpen(false);
    narrow.addEventListener("change", function () { setOpen(false); });

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ---- forms ---------------------------------------------------------- */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validity(field) {
    var value = (field.value || "").trim();
    if (field.type === "checkbox") return field.checked;
    if (!value) return false;
    if (field.type === "email") return EMAIL.test(value);
    if (field.type === "number") {
      var n = Number(value);
      if (Number.isNaN(n)) return false;
      if (field.min !== "" && n < Number(field.min)) return false;
      if (field.max !== "" && n > Number(field.max)) return false;
    }
    return true;
  }

  Array.prototype.forEach.call(document.querySelectorAll("form[data-validate]"), function (form) {
    var status = form.querySelector("[role='status']");
    var button = form.querySelector("button[type='submit']");
    var fields = Array.prototype.slice.call(form.querySelectorAll("[required]"));

    function check() {
      var ok = true;
      fields.forEach(function (field) {
        var good = validity(field);
        var error = document.getElementById(field.id + "-error");
        if (error) error.hidden = good;
        if (field.type !== "checkbox") {
          field.setAttribute("aria-invalid", good ? "false" : "true");
        }
        if (!good) ok = false;
      });
      return ok;
    }

    // Re-check a field once it has been corrected, never while first typing.
    fields.forEach(function (field) {
      field.addEventListener("blur", function () {
        if (field.getAttribute("aria-invalid") === "true") check();
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (status) status.textContent = "";

      if (!check()) {
        if (status) status.textContent = "Please correct the fields marked above.";
        var first = form.querySelector("[aria-invalid='true'], [required]:not(:checked)");
        if (first && first.focus) first.focus();
        return;
      }

      var label = button ? button.textContent : "";
      if (button) { button.disabled = true; button.textContent = "Sending"; }

      window.setTimeout(function () {
        if (button) { button.disabled = false; button.textContent = label; }
        if (status) {
          status.textContent = form.getAttribute("data-sent-message") ||
            "This is a demonstration page with no server attached, so nothing was sent.";
        }
      }, 700);
    });
  });
})();
