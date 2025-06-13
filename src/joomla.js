/*
 * Performs the primary Joomla installation steps.
 * This function is utilised by both installJoomla() and installJoomlaMultilingualSite().
 * - installJoomla(): Continues with completing the installation for stable releases.
 * - installJoomlaMultilingualSite(): Continues by installing additional languages without
 *   needing to handle cancelling the tour or disabling statistics at this stage.
 */
function doInstallation(config) {
  // Load installation page and check for language dropdown
  cy.visit('installation/index.php')

  // Select en-GB as installation language
  cy.get('body').then($body => {
    // Joomla >= 6.0 – Open minimised language selector
    if ($body.find('button[data-joomla-dialog]').length > 0) {
      cy.get('button[data-joomla-dialog]').click({ force: true })
      cy.get('#jform_language').should('be.visible').select('en-GB')
      cy.get('button[data-button-close]').click({ force: true })
    } else {
      // Joomla < 6.0
      cy.get('#jform_language').should('be.visible').select('en-GB')
    }
  })

  // Fill Sitename
  cy.get('#jform_site_name').type(config.sitename)
  cy.get('#step1').click()

  // Fill Admin credentials
  cy.get('#jform_admin_user').type(config.name)
  cy.get('#jform_admin_username').type(config.username)
  cy.get('#jform_admin_password').type(config.password)
  cy.get('#jform_admin_email').type(config.email)
  cy.get('#step2').click()

  // Fill database connection settings
  let connection = config.db_host
  const isPortSet = config.db_port && config.db_port.trim() !== "";
  // If the host is an IPv6 address, not already in square brackets, 
  // and it's not PostgreSQL without a port number, add square brackets around it.
  if (connection.split(':').length > 2 && !connection.includes('[') &&
      (isPortSet || (config.db_type !== 'PostgreSQL (PDO)') && (config.db_type !== 'pgsql'))) {
    // MariaDB and MySQL require square brackets around IPv6 addresses, even if no port is set
    // For PostgreSQL, square brackets are used only if a port number is provided
    // (see PR https://github.com/joomla-framework/database/pull/315)
    connection = `[${connection}]`;
  }
  if (isPortSet) {
    connection += `:${config.db_port.trim()}`;
  }
  cy.get('#jform_db_type').select(config.db_type)
  cy.get('#jform_db_host').clear().type(connection)
  cy.get('#jform_db_user').type(config.db_user)
  if (config.db_password) {
    cy.get('#jform_db_pass').type(config.db_password)
  }

  cy.get('#jform_db_name').clear().type(config.db_name)
  cy.get('#jform_db_prefix').clear().type(config.db_prefix)
  cy.intercept('index.php?task=installation.create*').as('ajax_create')
  cy.intercept('index.php?task=installation.populate1*').as('ajax_populate1')
  cy.intercept('index.php?task=installation.populate2*').as('ajax_populate2')
  cy.intercept('index.php?task=installation.populate3*').as('ajax_populate3')
  cy.intercept('index.php?view=remove&layout=default').as('finished')
  cy.get('#setupButton').click()
  cy.wait(['@ajax_create', '@ajax_populate1', '@ajax_populate2', '@ajax_populate3', '@finished'], {timeout: 120000})
  cy.get('#installCongrat').should('be.visible')
}

const joomlaCommands = () => {

  // Install Joomla via the user interface
  const installJoomla = (config) => {
    cy.log('**Install Joomla**')
    cy.log('Config: ' + config)

    doInstallation(config);

    // In case of Stable release the Joomla Web Installer needs one more click to complete the installation
    cy.get('button.complete-installation').then($button => {
      // Check if the button exists
      if ($button.length > 0) {
        // If there is a button, click on it and
        // since there are two of them, just click on the first one, it doesn't matter which one
        cy.wrap($button).first().click()
      }
    })

    cy.log('--Install Joomla--')
  }

  Cypress.Commands.add('installJoomla', installJoomla)


 /**
   * Cancel the guided tour.
   * Custom Cypress command to close the guided tour overlay window 'Welcome to Joomla!'.
   *
   * @memberof Cypress.Commands
   * @method cancelTour
   * @returns {Cypress.Chainable}
   *
   * With Joomla 5.1 the 'Welcome to Joomla!' guided tour starts automatically the very first time an user logs in
   * to the Administrator backend. As this overlay window is blocking interaction with the underlying content
   * it needs to be closed.
   *
   * In Joomla 5.1 the overlay window is closed with the cancel button.
   * Since Joomla 5.2 there is an additional function to hide tours forever. This is preferably used.
   *
   * A Joomla administrator must be logged in for this.
   * This command can only be executed once after a Joomla installation and only from version 5.1 upwards.
   */
  Cypress.Commands.add('cancelTour', () => {
    cy.log('**Cancel Tour**')
    const startButton = '.shepherd-button-primary'  // 'Start'
    const cancelButton = '.shepherd-cancel-icon'    // 'X'
    const skipButton = '.shepherd-button-secondary' // 'Hide Forever'

    // Wait for the overlay window of the guided tour, as it is generated by JavaScript.
    cy.get(startButton).should('exist')
    cy.get('body').then(($body) => {
      // First attempt: As introduced with Joomla 5.2, skip the guided tour with the 'Hide Forever' button.
      if ($body.find(skipButton).length > 0) {
        cy.get(skipButton).click()
      } else {
        // Second attempt: As introduced with Joomla 5.1 cancel guided tour with button 'X'.
        cy.get(cancelButton).click()
      }
    })

    cy.log('--Cancel Tour--')
  })


  /**
   * Disable Statistics Plugin
   *
   * Preconditions:
   * - Admin login is required before executing this function.
   * - This function can be executed multiple times without causing issues.
   *
   * Steps:
   * 1. Navigate to the Plugins management page.
   * 2. Search for the "System - Joomla! Statistics" plugin.
   * 3. Open the plugin's detail view.
   * 4. Set the plugin status to "Disabled".
   * 5. Save and close the plugin configuration.
  */
  const disableStatistics = () => {
    const statisticPlugin = 'System - Joomla! Statistics';
    cy.log('**Disable Statistics**')

    cy.visit('/administrator/index.php?option=com_plugins&view=plugins');
    cy.searchForItem(statisticPlugin);
    cy.get('a').contains(statisticPlugin).click();
    cy.get('select#jform_enabled').select('Disabled');
    cy.get('button.button-save.btn.btn-success').click();

    cy.log('--Disable Statistics--')
  }

  Cypress.Commands.add('disableStatistics', disableStatistics)


  // Set Errorreporting to dev mode
  const setErrorReportingToDevelopment = () => {
    cy.log('**Set error reporting to dev mode**')

    cy.visit('administrator/index.php?option=com_config')

    cy.contains('.page-title', 'Global Configuration').scrollIntoView()
    cy.get("div[role='tablist'] button[aria-controls='page-server']").click()
    cy.get('#jform_error_reporting').select('Maximum')

    cy.intercept('index.php?option=com_config*').as('config_save')
    cy.clickToolbarButton('save')
    cy.wait('@config_save')
    cy.contains('.page-title', 'Global Configuration').should('exist')
    cy.contains('#system-message-container', 'Configuration saved.').should('exist')

    cy.log('--Set error reporting to dev mode--')
  }

  Cypress.Commands.add('setErrorReportingToDevelopment', setErrorReportingToDevelopment)


  // Install Joomla as a multi language site
  const installJoomlaMultilingualSite = (config, languages = []) => {
    cy.log('**Install Joomla as a multi language site**')

    if (!languages.length)
    {
        // If no language is passed French will be installed by default
        languages = ['French']
    }

    doInstallation(config);

    cy.get('#installAddFeatures').then(($btn) => {
      cy.wrap($btn.text().trim()).as('installAddFeaturesBtnText')
    })

    cy.get('#installAddFeatures').click()

    cy.get('@installAddFeaturesBtnText').then((text) => {
      cy.contains('legend', text).should('exist')
    })

    languages.forEach((language) => {
        cy.contains('label', language).click()
    })

    cy.get('#installLanguagesButton').click()

    cy.get('#installCongrat', { timeout: 30000 }).should('be.visible')

    cy.get('#defaultLanguagesButton').click()
    cy.get('#system-message-container .alert-message').should('have.length', 2)

    // delete installation
    cy.get('body').then((body) => {
      // Joomla 5: check element with ID 'removeInstallationFolder' exists
      if (body.find('#removeInstallationFolder').length > 0) {
        cy.get('#removeInstallationFolder').click()
      } else {
        // Joomla 4: simple click 1st button to complete installation and delete installation folder
        cy.get('.complete-installation').eq(0).click()
      }
    })

    // Check installation is no longer available - it may take a little while
    const maxRetries = 10
    cy.wrap(null).then(function checkRequest() {
      // Current attempt count is kept in `this` context
      if (!this.attempts) {
        this.attempts = 0
      }
      this.attempts += 1
      cy.request({
        url: "/installation",
        failOnStatusCode: false // Prevent Cypress from failing on non-2xx status codes
      }).then((response) => {
        if (response.status !== 404 && this.attempts < maxRetries) {
          cy.wait(1000).then(checkRequest) // Wait for 1 second and retry
        } else {
          expect(response.status).to.equal(404) // Yes, we are looking for 404 Not Found
        }
      })
    })

    cy.log('Joomla is now installed')

    cy.log('--Install Joomla as a multi language site--')
  }

  Cypress.Commands.add('installJoomlaMultilingualSite', installJoomlaMultilingualSite)
}

module.exports = {
    joomlaCommands
}
