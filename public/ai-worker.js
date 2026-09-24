// Index V21 compatibility stub.
// AI inference is now server-side so this worker intentionally does not load any model.
self.onmessage = () => {
  self.postMessage({type:'status', text:'Cloud AI • no model is loaded on this device', kind:'ready'});
};
