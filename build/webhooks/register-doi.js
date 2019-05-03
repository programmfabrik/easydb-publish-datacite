const ez5 = require('ez5');
const util = require('util');
const fs = require('fs');
const querystring = require('querystring');

const fetch = require('node-fetch');

// Configuration

const info = JSON.parse(process.argv[2]);
info.paths = module.paths;
info.env = process.env;
const easyDbUrl = info.config.system.server.external_url;

const config = require('../../config.js');


function returnJsonError(error, status = 500) {
  console.log(JSON.stringify({
    headers: {
      'Content-Type': 'application/json; charset: utf-8'
    },
    body: JSON.stringify({error}),
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
var test = false;
if ('test' in info.parameters.query_string_parameters) {
  test = info.parameters.query_string_parameters.test.includes('true')
}

var {useConfig = 'test'} = info.parameters.query_string_parameters;
// Parse body
if (info.parameters.body) {
  log(`Using config ${useConfig}`);
  try {
    const transition = JSON.parse(info.parameters.body);
    log(transition);
    if (['UPDATE', 'INSERT'].includes(transition.operation)) {
      registerAllDOIs(transition.objects, useConfig).then( statuses => {
        log('All async registerDoiForObject finished');
        ez5.returnJsonBody(Object.assign(statuses));
      }).catch(error => {
        log('ERROR ' + error.toString());
        returnJsonError(error.toString());
      })
    }
  }
  catch (error) {
    log('ERROR ' + error.toString());
    returnJsonError(error.toString());
  }
}
else if (test) {
  (async () => {
    //const session = await authenticateEasyDb(config.easyDb.user, config.easyDb.password);
    const session = await authenticateEasyDb("bla", config.easyDb.password);
    const easyDbOpts = Object.assign({ token: session.token }, config.easyDb);
    return await registerDoiForObject({
      '_system_object_id': 29279,
      '_uuid': 'b1d5c5ba-69d1-4b8d-954f-5de235c43f4a'
    }, easyDbOpts, config.datacite['test'] );
  })().then( status => ez5.returnJsonBody(status))
  .catch( error => {
    log('ERROR ' + error.toString());
    returnJsonError(error.toString());
  });
}
else {
  returnJsonError('Call without test query parameter or no content in body', 400);
}
