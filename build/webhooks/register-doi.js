const ez5 = require('ez5');
const util = require('util');
const fs = require('fs');
const querystring = require('querystring');
const crypto = require('crypto');

const fetch = require('node-fetch');
const bufferEq = require('buffer-equal-constant-time');

const info = JSON.parse(process.argv[2]);
info.paths = module.paths;
info.env = process.env;
const easyDbUrl = info.config.system.server.external_url;

// Read configuration
const config = require('../../config.js');


function returnAndLogJsonError(error, status = 500) {
  const errorString = JSON.stringify({error});
  log(errorString)
  console.log(JSON.stringify({
    headers: {
      'Content-Type': 'application/json; charset: utf-8'
    },
    body: errorString,
    status_code: status
  }));
}

function authHeader(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
}

function log(messageOrObject) {
  if (typeof messageOrObject === 'object' && messageOrObject !== null) {
    messageOrObject = JSON.stringify(messageOrObject, null, 2);
  }
  fs.appendFileSync(config.logFile, `${new Date().toISOString()} ${messageOrObject}\n`);
}

async function authenticateEasyDb(username, password) {
  // get session token
  const sessionPath = '/api/v1/session';
  let response = await fetch(easyDbUrl + sessionPath);
  let token;
  if (response.ok) {
    ({ token } = await response.json());
  }
  else {
    const responseText = await response.text();
    throw Error(`Failed calling ${sessionPath}: ${response.status} ${response.statusText} ${responseText}`);
  }
  log(`authenticateEasyDb: session token ${token}`);
  let queryString = querystring.stringify({token, login: username, password});
  log(`authenticateEasyDb: authenticate user ${username}`);
  const authenticateResp = await fetch(`${easyDbUrl}/api/v1/session/authenticate?${queryString}`,
    { method: 'post' });
  if (authenticateResp.ok) {
    const session = await authenticateResp.json();
    if(session.authenticated) {
      log(`authenticateEasyDb: authenticated with easyDb, token: ${session.token}`);
      return session;
    }
    else {
      const responseText = JSON.stringify(session);
      throw Error(`Failed easyDb authentication, response: ${responseText}`);
    }
  }
  else {
    const responseText = await authenticateResp.text();
    throw Error(`Failed easyDb authentication: ${authenticateResp.status} ${authenticateResp.statusText}, response: ${responseText}`);
  }
}

async function registerDoiForObject(dbObject, easyDbOpts, dataciteOpts) {
  const { username, password, endpoint: dataciteEndpoint, doiPrefix} = dataciteOpts;
  const { xsltName, token: easyDbToken, collector } = easyDbOpts;
  const dataciteAuth = authHeader(username, password);
  const metadataUrl = easyDbUrl + '/api/v1/objects/uuid/' + dbObject._uuid + '/format/xslt/' + xsltName;
  const systemObjectId = dbObject._system_object_id;
  const doi = `${doiPrefix}/${systemObjectId}`;
  const objectDetailUrl = `${easyDbUrl}/detail/${systemObjectId}`;

  let metadataXml = await fetch(metadataUrl).then(resp => resp.text());
  log(`Got metadata for ${dbObject._uuid}`);
  //TODO find better placeholder string
  metadataXml = metadataXml.replace('10.xxx', doiPrefix);

  const dataciteMetadataUrl = dataciteEndpoint + '/metadata/' + doi;
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

  const dataciteMintUrl = `${dataciteEndpoint}/doi/${doi}`;
  const body = `doi=${doi}\nurl=${objectDetailUrl}\n`
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
    collector,
    publish_uri: 'https://doi.org/' + doi,
    easydb_uri: objectDetailUrl
  }

  log('POST publish object:');
  log(publish);
  publishResponse = await fetch(easyDbUrl + '/api/v1/publish?token=' + easyDbToken,
  {
    method: 'post',
    body: JSON.stringify([{publish}])
  }).then(resp => resp.json());
  log('Publish response:');
  log(publishResponse);
  return {
    published: publishResponse
  };
}

async function registerAllDOIs(objects, useConfig) {
  const session = await authenticateEasyDb(config.easyDb.user, config.easyDb.password);
  const easyDbOpts = Object.assign({ token: session.token }, config.easyDb);

  // New or updated object call async register doi and await all result
  return Promise.all(objects.map( dbObject => registerDoiForObject(dbObject, easyDbOpts, config.datacite[useConfig]) ));
}

function verifySignature(body, receivedSignature, secret) {
  log('verifying receivedSignature: ' + receivedSignature);
  let hmac = crypto.createHmac('sha1', secret);
  hmac.update(body);
  const signature = 'sha1=' + hmac.digest('hex');
  // Compare buffers in constant time
  log('calculated signature: ' + signature);
  return bufferEq(new Buffer(signature), new Buffer(receivedSignature));
}

/* How to write different responses
   easydb Webhook Plugin expects JSON output on STDOUT.
   We can return a JSON object with keys "headers", "body" and "status_code".
   see https://docs.easydb.de/en/technical/plugins/webhooks/webhook/

console.log(JSON.stringify({
  headers: {
    'Content-Type': 'text/html; charset: utf-8'
  },
  body: 'Info was successfully stored into file: ' + dumpfile + '.'
}));
*/

// Parse query parameters
var {useConfig = 'test'} = info.request.query_string_parameters;
// Parse body
if (!info.request.body) {
  returnAndLogJsonError('Missing request body', 400);
  return;
}
if (!verifySignature(info.request.body, info.request.headers['X-Hub-Signature'], config.HMACSecret)) {
  returnAndLogJsonError('Invalid signature hash or wrong HMACSecret configured', 401);
  return;
}
log(`Using config ${useConfig}`);
try {
  const transition = JSON.parse(info.request.body);
  log(info.request);
  log(transition);
  if (!['UPDATE', 'INSERT'].includes(transition.operation)) {
    returnAndLogJsonError('Invalid JSON body, expected "operation" key with value "UPDATE" or "INSERT" operation')
    return;
  }
  registerAllDOIs(transition.objects, useConfig).then( statuses => {
    log('All registerDoiForObject finished successfully');
    ez5.returnJsonBody(Object.assign(statuses));
  }).catch(error => {
    returnAndLogJsonError(error.toString());
  })
}
catch (error) {
  returnAndLogJsonError(error.toString());
}
