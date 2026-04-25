const handler = require('../../server');

module.exports = (request, response) => {
  const parsedUrl = new URL(request.url || '/', 'http://127.0.0.1');
  request.url = `/api/search/actress${parsedUrl.search}`;
  return handler(request, response);
};
