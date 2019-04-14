const {Builder} = require('selenium-webdriver');
const selenium = require('selenium-webdriver');

const SqlRepository = require('./app/sqlrepository');
const Instagram = require('./app/instagram');
const Reddit = require('./app/reddit');
const config = require('./config.json');

/**
 * Sleeps the application for a specified length of time.
 * @param {Int} ms Length of time in milliseconds.
 */
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a Selenium Webdriver instance with Chrome.
 * @param {Bool} headless Whether or not to make the WebDriver headless.
 * @return {WebDriver} The WebDriver client.
 */
async function buildDriver(headless = true) {
  const capabilities = selenium.Capabilities.chrome();
  let options = {};

  if (headless) {
    options = {
      'args': ['--disable-notifications', '--headless'],
    };
  } else {
    options = {
      'args': ['--disable-notifications'],
    };
  }

  capabilities.set('chromeOptions', options);
  return new Builder().forBrowser('chrome').withCapabilities(capabilities).build();
}

/**
 * Cleans the specified date object.
 * @param {Date} date The current object.
 * @return {String} A clean date representation of the time.
 */
function cleanDate(date) {
  let hours = date.getHours();
  let minutes = date.getMinutes();
  let seconds = date.getSeconds();

  (hours < 10) ? hours = '0' + hours : hours;
  (minutes < 10) ? minutes = '0' + minutes : minutes;
  (seconds < 10) ? seconds = '0' + seconds : seconds;

  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Starts the application.
 * @param {Bool} persist Whether or not we should persist the WebDriver and the currentPosts.
 * @param {WebDriver} driver The Selenium WebDriver.
 * @param {Array} currentPosts An array of the current posts.
 */
async function start(persist = false, driver = undefined, currentPosts = []) {
  const db = new SqlRepository(config.database);
  const instagram = new Instagram(config.instagram);
  const reddit = new Reddit(config.reddit);

  if (!persist || currentPosts.length < 1) {
    driver = await buildDriver();
    db.init();
    currentPosts = await db.getAlreadyPosted();
  }

  const postUris = await instagram.getPostRepresentations(driver, currentPosts);

  if (postUris.length < 1) {
    const date = new Date();
    if (date.getMinutes() == 37 && date.getSeconds() > 30) {
      await driver.quit();
      return console.log('Quitting application.');
    }
    const cleanedDate = cleanDate(date);
    console.log(`${cleanedDate} - No new posts found. Pausing for 15 seconds and re-checking.`);

    await sleep(15000);
    await start(true, driver, currentPosts);
  }

  if (config.verboseLogging) {
    console.time('start()');
  }

  instagram.downloadImages(postUris);

  await driver.quit();
  driver = await buildDriver(false);
  await reddit.login(driver);

  for (let i = 0; i < postUris.length; i++) {
    if (!postUris[i].filePath) {
      await db.logPost(postUris[i].postUri);
      continue;
    }

    await reddit.post(driver, postUris[i]);
    await db.logPost(postUris[i].postUri);
  }

  await driver.quit();

  if (config.verboseLogging) {
    console.timeEnd('start()');
  }

  await start();
}

start();
