const { createApp } = require('../server');

let appPromise;

module.exports = async function handler(request, response) {
  if (!appPromise) {
    appPromise = createApp();
  }

  const app = await appPromise;
  return app.requestHandler(request, response);
};
