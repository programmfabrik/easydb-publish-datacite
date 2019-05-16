// Configuration for the datacite webhook
//
module.exports = {
  HMACSecret: 'dasisteingeheimnis',
  logFile: '/easydb-5/var/register-doi.log',
  easyDb: {
    user: 'easydb-api-user',
    password: 'apassword',
    collector: 'datacite',
    xsltName: 'datacite'
  },
  datacite: {
    // Profiles with different credentials and prefixes
    test: {
      username: 'datacite-api-user',
      password: 'anotherpassword',
      endpoint: 'https://mds.test.datacite.org',
      // Doi will be built like this "<doiPrefix><systemObjectID>", e.g.,
      // given the following prefix and systemObjectID = 1234:
      // 10.5072/abc.1234
      doiPrefix: '10.5072/abc.'
    },
    ubhd: {
      username: 'another-datacite-api-user',
      password: 'onemorepassword',
      endpoint: 'https://mds.datacite.org',
      doiPrefix: '10.xxxx/abc.'
    }
  }
}
