> This Plugin / Repo is being maintained by a community of developers.
There is no warranty given or bug fixing guarantee; especially not by
Programmfabrik GmbH. Please use the github issue tracking to report bugs
and self organize bug fixing. Feel free to directly contact the committing
developers.
 
# easydb-publish-datacite

Webhook Plugin for easydb to publish to datacite.org.

## Webhook workflow

The [webhook script](build/webhooks/register-doi.js) executes the following action:
 1. Request Datacite metadata from easydb api/v1/objects/uuid/ using a XSLT stylesheet
 2. Post this metadata to Datacite API with a generated DOI from prefix and system_object_id
 3. Register the easyDb detail URL as underlying for the DOI to publish the DOI with Datacite
 4. Post registered DOI and URL to easyDb publish API

## Installation

 1. Clone or Download the plugin in to the easyDB Plugin directory of your installation.
    For example:
    ```
    cd /srv/easydb/instance-name/config/plugin
    git clone https://github.com/programmfabrik/easydb-publish-datacite.git publish-datacite
    ```
 2. Run `npm install` in the plugin directory:
    ```
    cd publish-datacite
    npm install
    ```
 3. Enable the plugin in your installation. See https://docs.easydb.de/en/technical/plugins/#enabling-the-plugin-in-the-server .
    Add the relative path to the plugin YAML configuration, e. g., `plugin/publish-datacite/publish-datacite.config.yml` to your easyDb configuration file, as shown in the easyDb documentation.

## Configuration

 1. Copy the configuration template `config.TEMPLATE.js` to the actual configuration `config.js` used by the plugin.
 2. Enter your Datacite credentials, DOI prefix, easyDb API user with password, HMACSecret and XSLT name. The easyDb user entered needs access to POST to the publish API.
 3. Within the key `datacite` you can add several different profiles to use as different actions in a workflow.
    For example, if you have a key `test` under `datacite` then you can configure a webhook with the additional query parameter `useConfig=test`.
    The webhook will use the credentials stored under `datacite.test` in the `config.js`.

 4. Add the Webhook URL in the easyDb base configuration under "Tag & Workflow" > "Workflow Webhook".
    The full URL of the webhook depends on your installation but it looks something like this:
    `https://easydb-server/api/v1/plugin/base/webhook-plugin/webhook/publish-datacite/register-doi?useConfig=test`.
    Also add the HMACSecret you entered in the plugin configuration to authenticate the requests.
 5. Upload an XSLT that fits your datamodel under the easyDb base configuration item "Export and OAI/PMH" > "XSLT formats".
     Check the box "Use for Deep-Links with /api/v1/objects" and choose the name you entered in the plugin configuration. For starting out take a look at the [XSLT file used for heidICON](xslt/heidicon2datacite.xsl), most of the fields are required for Datacite. For further information about the XML schema see the Datacite API documentation: https://support.datacite.org/docs/schema-mandatory-properties-v41 .
 6. Reload the frontend. Now you can use the webhook as part of a workflow action under "Tags & Workflows"

See https://docs.easydb.de/en/technical/plugins/webhooks/webhook/ for more information on easyDb webhooks and configuration.

## Appendix
Developed at University Library Heidelberg in 2019.
https://www.ub.uni-heidelberg.de , https://github.com/UB-Heidelberg
by Nils Weiher and Leonhard Maylein.

Published under [MIT License](LICENSE)
