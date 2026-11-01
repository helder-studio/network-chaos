---
"@helder-studio/network-chaos": patch
---

Fix: the timeout effect now honours xhr.timeout (axios), reused XMLHttpRequest instances reset after a faked response, synchronous XHR passes untouched, hydration runs once even with an inline storage adapter, and the web panel keeps focus outlines.
