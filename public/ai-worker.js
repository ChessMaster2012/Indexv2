// Compatibility stub: Index Tutor runs AI on the server. No model is loaded in the browser.
self.onmessage = () => self.postMessage({type:'status', text:'Server AI ready', kind:'ready'});
