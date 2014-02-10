'use strict';
var _ = require('underscore'),
    chalk = require('chalk'),
    fs = require('fs'),
    git = require('../lib/git'),
    grunt = require('grunt'),
    path = require('path'),
    util = require('util'),
    semver = require('semver'),
    yeoman = require('yeoman-generator');

var ReleaseGenerator = module.exports = function ReleaseGenerator(args, options, config) {
  yeoman.generators.Base.apply(this, arguments);

  this.option('skip-tests', {
    desc: 'Skips tests. This is not recommended but can be used to work around environmental issues.',
    type: 'Boolean'
  });
  this.skipTests = options['skip-tests'];

  if (!args.length && fs.existsSync('.generator-release')) {
    var options = JSON.parse(fs.readFileSync('.generator-release').toString());
    this.increment = options.increment;
    this.version = options.version;

    if (/^v(.*)$/.test(this.version)) {
      this.version = RegExp.$1;
    }
  }

  if (!this.increment) {
    this.argument('increment', {desc: 'Increment type. May be one of {major, minor, patch, prerelease}', required: true});
  }
  if (this.increment === 'custom') {
    if (!semver.valid(this.version)) {
      throw new Error('Custom version "' + this.version + '" is invalid');
    }
  } else if (this.increment !== 'major' && this.increment !== 'minor' && this.increment !== 'patch' && this.increment !== 'prerelease') {
    throw new Error('"' + this.increment + '" must be one of {major, minor, patch, prerelease}');
  }
};

util.inherits(ReleaseGenerator, yeoman.generators.Base);

ReleaseGenerator.prototype.ensureClean = git.ensureClean;
ReleaseGenerator.prototype.ensureFetched = git.ensureFetched;

ReleaseGenerator.prototype.runTest = function() {
  if (!fs.existsSync('package.json') || this.skipTests) {
    return;
  }

  var cb = this.async();

  this.spawnCommand('npm', ['test'])
      .on('error', function(err) {
        throw err;
      })
      .on('exit', function(code) {
        if (code) {
          throw new Error('Tests failed');
        } else {
          cb();
        }
      });
};

ReleaseGenerator.prototype.readVersions = function() {
  try {
    this.bowerConfig = JSON.parse(fs.readFileSync('bower.json'));
  } catch (err) {
    /* NOP */
  }
  try {
    this.packageConfig = JSON.parse(fs.readFileSync('package.json'));
  } catch (err) {
    /* NOP */
  }

  this.priorVersion = (this.bowerConfig || this.packageConfig).version;

  if (this.increment !== 'custom') {
    this.version = semver.inc(this.priorVersion, this.increment);
  }
  if (this.priorVersion && this.priorVersion !== '0.0.0') {
    this.firstCommit = 'v' + this.priorVersion;
  }
};

ReleaseGenerator.prototype.originName = git.originName;
ReleaseGenerator.prototype.findFirstCommit = git.findFirstCommit;
ReleaseGenerator.prototype.commitTime = git.commitTime;
ReleaseGenerator.prototype.findChanges = git.findChanges;

ReleaseGenerator.prototype.incrementVersion = function() {
  console.log('Incrementing ' + chalk.yellow(this.priorVersion) + ' to ' + chalk.yellow(this.version));

  var files = [];
  if (this.bowerConfig) {
    this.bowerConfig.version = this.version;
    fs.writeFileSync('bower.json', JSON.stringify(this.bowerConfig, undefined, 2) + '\n');
    files.push('bower.json');
  }
  if (this.packageConfig) {
    this.packageConfig.version = this.version;
    fs.writeFileSync('package.json', JSON.stringify(this.packageConfig, undefined, 2) + '\n');
    files.push('package.json');
  }

  if (files.length) {
    this.modifiedFiles = files;
  } else {
    throw new Error('No config files written');
  }
};

ReleaseGenerator.prototype.projectUpdate = function() {
  // Load the grunt tasks list
  grunt.task.init([], {help: true});
  var tasks = _.keys(grunt.task._tasks);

  // If there is a version task, run it
  if (tasks.indexOf('version') >= 0) {
    var cb = this.async();

    this.spawnCommand('grunt', ['version', '--ver=' + this.version])
        .on('error', function(err) {
          throw err;
        })
        .on('exit', function(code) {
          if (code) {
            throw new Error('Version update failed');
          } else {
            cb();
          }
        });
  }
};

ReleaseGenerator.prototype.commit = function() {
  // We are assuming that we will always modify somehting and that the
  // version task will add it's content manually if run.
  git.addCommit(this, this.modifiedFiles, 'v' + this.version);
};

ReleaseGenerator.prototype.tag = function() {
  git.tag(this, 'v' + this.version);
};

ReleaseGenerator.prototype.push = git.push;
ReleaseGenerator.prototype.pingPullRequests = git.pingPullRequests;

ReleaseGenerator.prototype.cleanup = function() {
  if (fs.existsSync('.generator-release')) {
    fs.unlinkSync('.generator-release');
  }
};

ReleaseGenerator.prototype.notes = function() {
  console.log('Successfully pushed. If this is an npm package then `npm publish` now needs to be run.');
};
