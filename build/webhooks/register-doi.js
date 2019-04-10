const ez5 = require('ez5');
const util = require('util');
const fs = require('fs');
const querystring = require('querystring');

const fetch = require('node-fetch');

// Configuration

const info = JSON.parse(process.argv[2]);
info.paths = module.paths;
info.env = process.env;
const easydbUrl = info.config.system.server.external_url;

const config = require('../../config.js');

function authHeader(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
}

function log(messageOrObject) {
  if (typeof messageOrObject === 'object' && messageOrObject !== null) {
    messageOrObject = JSON.stringify(messageOrObject, null, 2);
  }
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${messageOrObject}\n`);
}

async function authenticateEasyDb(username, password) {
  // get session token
  const {token} = await fetch(easydbUrl + '/api/v1/session').then(resp => resp.json());
  log(`authenticateEasyDb: session token ${token}`);
  let queryString = querystring.stringify({token, login: username, password});
  log(`authenticateEasyDb: authenticate user ${username}`);
  const session = await fetch(`${easydbUrl}/api/v1/session/authenticate?${queryString}`,
    { method: 'post' }).then(resp => resp.json());
  if(session.authenticated) {
    log(`authenticateEasyDb: authenticated with easyDb, token: ${session.token}`)
  }
  else {
    log('authenticateEasyDb: Not authenticated, response: \n' + JSON.stringify(session, null, 2));
  }
  return session;
}

async function registerDoiForObject(dbObject, easyDbToken) {
  const dataciteAuth = authHeader(USERNAME, PASSWORD);
  const metadataUrl = easydbUrl + '/api/v1/objects/uuid/' + dbObject._uuid + '/format/xslt/' + XSLT_NAME;
  const systemObjectId = dbObject._system_object_id;
  const doi = `${DOI_PREFIX}/${systemObjectId}`;
  const url = `${easydbUrl}/detail/${systemObjectId}`;

  let metadataXml = await fetch(metadataUrl).then(resp => resp.text());
  log(`Got metadata for ${dbObject._uuid}`);
  metadataXml = metadataXml.replace('10.xxx', DOI_PREFIX);

  const dataciteMetadataUrl = DATACITE_MDS_URL + '/metadata/' + doi;
  log(`PUT metadata to ${dataciteMetadataUrl}`);
  const dataciteMetadataResponse = await fetch(dataciteMetadataUrl, {
    method: 'put',
    body: metadataXml,
    headers: {
      'Content-Type': 'application/xml',
      'Authorization': dataciteAuth,
    }
  }).then(resp => resp.text());
  log('SUCCESS, response: ' + dataciteMetadataResponse);

  const dataciteMintUrl = `${DATACITE_MDS_URL}/doi/${doi}`;
  const body = `doi=${doi}\nurl=${url}\n`
  log(`PUT ${dataciteMintUrl} with body: ${body}`);
  const dataciteMintResponse = await fetch(dataciteMintUrl, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Authorization': dataciteAuth,
    }
  }).then(resp => resp.text());
  log('SUCCESS, response: ' + dataciteMintResponse);
  // TODO call api publish here
  const publish = {
    system_object_id: systemObjectId,
    collector: PUBLISH_COLLECTOR,
    publish_url: 'https://doi.org/' + doi,
    easydb_url: url
  }

  log('POST publish object:');
  log(publish);
  publishResponse = await fetch(easydbUrl + '/api/v1/publish?token=' + easyDbToken,
  {
    method: 'post',
    body: JSON.stringify([{publish}])
  }).then(resp => resp.json());
  log('Publish response:');
  log(publishResponse);
  return {
    objectMetadata: metadataXml,
    dataciteMetadataResponse,
    dataciteMintbody: body,
    dataciteMintResponse,
    publish,
    publishResponse
  };
}

async function registerAllDOIs(objects) {
  const session = await authenticateEasyDb(easyDbUser, easyDbPassword);
  if(!session.authenticated) {
    ez5.returnJsonBody({ info: info});
  }
  // New or updated object call async register doi and await all result
  return Promise.all(objects.map( dbObject => registerDoiForObject(dbObject, session.token) ));
}

/* how to write different responses
console.log(JSON.stringify({
  headers: {
    'Content-Type': 'text/html; charset: utf-8'
  },
  body: 'Info was successfully stored into file: ' + dumpfile + '.'
}));
*/

// Parse query parameters
var test = false;
if ('test' in info.parameters.query_string_parameters) {
  test = info.parameters.query_string_parameters.test.includes('true')
}

var {useConfig = 'datacite-test'} = info.parameters.query_string_parameters;

// Parse body
if (info.parameters.body) {
  log(`Using config ${useConfig}`);
  const transition = JSON.parse(info.parameters.body);
  log(transition);
  if (['UPDATE', 'INSERT'].includes(transition.operation)) {
    registerAllDOIs(transition.objects).then( statuses => {
      log('All async registerDoiForObject finished');
      ez5.returnJsonBody(Object.assign({ info }, statuses));
    })
  }
}
else if (test) {
  (async () => {
    const session = await authenticateEasyDb(easyDbUser, easyDbPassword);
    if(!session.authenticated) {
      ez5.returnJsonBody({ info: info});
    }
    return await registerDoiForObject({
      '_system_object_id': 29279,
      '_uuid': 'b1d5c5ba-69d1-4b8d-954f-5de235c43f4a'
    }, session.token);
  })().then( status => ez5.returnJsonBody(Object.assign({ info }, status)));
}
else {
  ez5.returnJsonBody({ info: info });
}
