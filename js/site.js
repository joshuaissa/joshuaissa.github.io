// Autoplay looping films only when visible and when the reader allows motion.
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var vids = document.querySelectorAll("video.js-auto");
  if (reduce) { vids.forEach(function (v) { v.removeAttribute("autoplay"); v.controls = true; }); return; }
  if (!("IntersectionObserver" in window)) { vids.forEach(function (v) { v.play().catch(function () {}); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { v.play().catch(function () { v.controls = true; }); } else { v.pause(); }
    });
  }, { threshold: 0.25 });
  vids.forEach(function (v) { io.observe(v); });
})();
