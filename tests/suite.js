var P = P || {};

/**
 * @typedef {Object} ProjectMeta
 * @property {string} path The path to download this project from.
 * @property {number} timeout The time, in milliseconds, to wait for a project to run.
 * @property {string[]} ignoredFailures Failure messages to ignore, and allow the project to continue.
 * @property {number} repeatCount The total number of times to repeat this test.
 */

/**
 * @typedef {Object} TestResult
 * @property {boolean} success Was the test a success?
 * @property {string} message An optional message provided by the project.
 * @property {number} projectTime The total time, in milliseconds, that was spent in the project.
 * @property {number} totalTime The total time, in milliseconds, that this project took to test. Includes asset loading, compiling, among other things.
 */

/**
 * @typedef {Object} FinalResults
 * @property {TestResult[]} tests All tests run
 * @property {number} time The time, in milliseconds, to complete the test.
 */

/**
 * @typedef {2|3} ProjectType
 */

/**
 * Automated test suite
 */
P.suite = (function() {
  'use strict';

  const containerEl = document.getElementById('suite-container');
  const tableBodyEl = document.getElementById('suite-table');
  const finalResultsEl = document.getElementById('suite-final-results');

  /**
   * Removes all children of an HTML element
   * @param {HTMLElement} element 
   */
  function removeChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /**
   * Create an HTML element
   * @param {string} tagName The tag of the HTML element
   * @param {any} options Properties to set on the Element in key/object form
   * @returns {HTMLElement}
   */
  function createElement(tagName, options = {}) {
    const el = document.createElement(tagName);
    for (const key of Object.keys(options)) {
      const value = options[key];
      el[key] = value;
    }
    return el;
  }

  /**
   * @param {string} path The path to fetch
   * @returns {ArrayBuffer} The ArrayBuffer representing the fetched content
   */
  function fetchAsArrayBuffer(path) {
    return fetch(path)
      .then((r) => r.arrayBuffer());
  }

  /**
   * Determines the type of a project
   * @param {string} path
   * @returns {ProjectType}
   */
  function getProjectType(path) {
    const extension = path.match(/\..*$/)[0];
    switch (extension) {
      case '.sb3': return 3;
      case '.sb2': return 2;
    }
    throw new Error('unknown project type: ' + extension);
  }

  /**
   * Load a project
   * @param {ArrayBuffer} buffer 
   * @param {ProjectType} type
   * @returns {Promise<P.core.Stage>}
   */
  function loadProjectBuffer(buffer, type) {
    if (type === 2) {
      return P.sb2.loadSB2Project(buffer);
    } else if (type === 3) {
      const loader = new P.sb3.SB3FileLoader(buffer);
      return loader.load();
    }
    throw new Error('unknown type: ' + type);
  }

  /**
   * Runs and tests a Stage
   * @param {P.core.Stage} stage
   * @param {ProjectMeta} metadata
   * @returns {Promise<TestResult>}
   */
  function testStage(stage, metadata) {
    removeChildren(containerEl);
    containerEl.appendChild(stage.root);

    return new Promise((_resolve, _reject) => {
      /**
       * @param {TestResult} result
       */
      const resolve = (result) => {
        const endTime = performance.now();
        result.projectTime = endTime - startTime;

        clearTimeout(timeoutId);
        stage.runtime.pause();
        stage.runtime.stopAll();

        _resolve(result);
      }

      /**
       * The test has failed.
       * @param {string} message
       * @returns {boolean} Stop the program's execution after this failure?
       */
      const testFail = (message) => {
        if (metadata.ignoredFailures.includes(message)) {
          return false;
        }
        resolve({
          success: false,
          message,
        });
        return true;
      };

      /**
       * Test test has passed.
       * @param {string} message
       */
      const testOkay = (message) => {
        resolve({
          success: true,
          message,
        });
      };

      /**
       * testFail() when the project encounters an error
       */
      const handleError = (e) => {
        const message = P.utils.stringifyError(e);
        stage.runtime.testFail('ERROR: ' + message);
      };

      /**
       * The project has not completed in a reasonable amount of time
       */
      const timeout = () => {
        testFail('timeout');
      }

      stage.runtime.testFail = testFail;
      stage.runtime.testOkay = testOkay;
      stage.runtime.handleError = handleError;

      const timeoutId = setTimeout(timeout, metadata.timeout);

      const startTime = performance.now();

      stage.runtime.start();
      stage.runtime.triggerGreenFlag();
    });
  }

  /**
   * Loads, runs, and tests a project.
   * @param {ProjectMeta} metadata The project's metadata
   * @param {ArrayBuffer} buffer The ArrayBuffer representing this project
   * @param {ProjectType} type The project's type
   * @returns {Promise<TestResult>}
   */
  function runProject(metadata, buffer, type) {
    const startTime = performance.now();
    return loadProjectBuffer(buffer, type)
      .then((stage) => testStage(stage, metadata))
      .then((result) => {
        const endTime = performance.now();
        result.totalTime = endTime - startTime;
        return result;
      });
  }

  /**
   * Converts a duration to a human readable string
   * @param {number} time Time, in milliseconds, to format
   * @returns {string} Human readable string
   */
  function formatTime(time) {
    const precision = 1e2; // two decimal places
    return Math.round(time * precision) / precision + 'ms';
  }

  /**
   * Displays the result of a test
   * @param {ProjectMeta} projectMeta
   * @param {TestResult} result
   */
  function displayResult(projectMeta, result) {
    const row = createElement('tr');

    row.appendChild(createElement('td', {
      className: 'cell-name',
    })).appendChild(createElement('a', {
      textContent: projectMeta.path,
      href: projectMeta.path,
    }));

    const message = (result.success ? 'OKAY: ' : 'FAIL: ') + result.message;
    const successClass = result.success ? 'cell-result-okay' : 'cell-result-fail';
    row.appendChild(createElement('td', {
      className: 'cell-result ' + successClass,
      textContent: message,
    }));

    row.appendChild(createElement('td', {
      className: 'cell-total-time',
      textContent: formatTime(result.totalTime),
    }));

    row.appendChild(createElement('td', {
      className: 'cell-project-time',
      textContent: formatTime(result.projectTime),
    }));

    tableBodyEl.appendChild(row);
  }

  /**
   * @param {FinalResults} result
   */
  function displayFinalResults(result) {
    const listEl = createElement('ul');

    listEl.appendChild(createElement('li', {
      textContent: 'Done in ' + formatTime(result.time),
    }));
    
    const totalTests = result.tests.length;
    const passingTests = result.tests.filter((i) => i.success).length;
    const failingTests = totalTests - passingTests;
    const percentPassing = Math.round((passingTests / totalTests) * 100);
    listEl.appendChild(createElement('li', {
      textContent: `Of ${totalTests} test, ${passingTests} passed and ${failingTests} failed. (${percentPassing}% passing)`,
    }));

    finalResultsEl.appendChild(listEl);
  }

  /**
   * Start the test suite
   * @param {ProjectMeta[]} projectList
   * @returns {Promise} Resolves when the test is done.
   */
  async function run(projectList) {
    removeChildren(tableBodyEl);

    const allTestResults = [];
    const startTime = performance.now();

    while (projectList.length > 0) {
      const projectMetadata = projectList.shift();
      const path = projectMetadata.path;
      const repeatCount = projectMetadata.repeatCount;

      const projectType = getProjectType(path);
      const buffer = await fetchAsArrayBuffer(path);

      for (let i = 0; i < repeatCount; i++) {
        const result = await runProject(projectMetadata, buffer, projectType);
        allTestResults.push(result);
        displayResult(projectMetadata, result);
      }
    }

    const endTime = performance.now();
    const totalTestTime = endTime - startTime;
    displayFinalResults({
      time: totalTestTime,
      tests: allTestResults,
    });
  }

  return {
    run,
  };
}());

/**
 * SB3 compiler hook
 */
(function(compiler) {
  // Works by replacing calls to certain procedures.

  const originalProcedureCall = compiler.statementLibrary['procedures_call'];

  function getArguments(block) {
    var source = '';
    const mutation = block.mutation;
    const inputIds = JSON.parse(mutation.argumentids);
    for (let i = 0; i < inputIds.length; i++) {
      const id = inputIds[i];
      const input = block.inputs[id];
      source += compiler.hooks.expression(input) + ', ';
    }
    return source.substr(0, source.length - 2);
  }

  compiler.statementLibrary['procedures_call'] = function procedureCall(block) {
    switch (block.mutation.proccode) {
      case 'FAIL':
        compiler.hooks.appendSource('if (runtime.testFail("no message")) { return; }\n');
        break;

      case 'FAIL %s':
        compiler.hooks.appendSource('if (runtime.testFail(' + getArguments(block) + ' || "no message")) { return; }\n');
        break;

      case 'OKAY':
      case 'OK':
        compiler.hooks.appendSource('runtime.testOkay(""); return;\n');
        break;

      case 'OKAY %s':
      case 'OK %s':
        compiler.hooks.appendSource('runtime.testOkay(' + getArguments(block) + ' || ""); return;\n');
        break;

      default:
        originalProcedureCall(block);
    }
  };
}(P.sb3.compiler));

/**
 * SB2 compiler hook
 */
(function(compiler) {
  // Works by overriding the compiler for listeners, and replacing the body of certain procedure definitions.
  const originalCompileListener = compiler.compileListener;
  compiler.compileListener = function compileListener(object, script) {
    const opcode = script[0][0];
    if (opcode !== 'procDef') {
      return originalCompileListener(object, script);
    }

    const proccode = script[0][1];
    var source;
    switch (proccode) {
      case 'OK':
      case 'OKAY':
        source = 'runtime.testOkay("no message"); return;\n';
        break;

      case 'OK %s':
      case 'OKAY %s':
      case 'OK %n':
      case 'OKAY %n':
        source = 'runtime.testOkay(C.args[0]); return;\n';
        break;
      
      case 'FAIL':
        source = 'if (runtime.testFail("no message")) { return; }\n';
        break;

      case 'FAIL %s':
      case 'FAIL %n':
        source = 'if (runtime.testFail(C.args[0])) { return; }\n';
        break;
      
      default:
        return originalCompileListener(object, script);
    }
    source += 'endCall();\n';
    const f = P.runtime.createContinuation(source);
    object.fns.push(f);
    object.procedures[proccode] = new compiler.Scratch2Procedure(f, false, []);
  };
}(P.sb2.compiler));
