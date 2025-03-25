/**
 * logger.js - Standardized logging for Lightning Lens
 *
 * This module provides consistent logging capabilities across all Lightning Lens
 * services. It supports file logging, console output with color coding,
 * and different log levels.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

// Default options
const defaultOptions = {
  serviceName: 'lightning-lens',
  logLevel: LOG_LEVELS.INFO,
  useColors: true,
  logToFile: true,
  logToConsole: true,
  logFilePath: null, // Will be determined based on serviceName if not provided
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5, // Keep 5 rotated log files
};

/**
 * Create a standardized logger instance
 * @param {Object} options Logging options
 * @returns {Object} Logger object with logging methods
 */
function createLogger(options = {}) {
  // Merge options with defaults
  const opts = { ...defaultOptions, ...options };

  // Determine log file path if not specified
  if (!opts.logFilePath && opts.logToFile) {
    opts.logFilePath = config.getLogPath(opts.serviceName);
  }

  // Ensure log directory exists
  if (opts.logToFile) {
    const logDir = path.dirname(opts.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  // Create the log message with timestamp and formatted message
  function formatLogMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logData = '';

    if (data) {
      if (typeof data === 'object') {
        try {
          // Format objects as nice JSON
          logData = '\n' + JSON.stringify(data, null, 2);
        } catch (e) {
          logData = `\n[Error serializing data: ${e.message}]`;
        }
      } else {
        logData = `\n${data}`;
      }
    }

    return `[${level}] ${timestamp} [${opts.serviceName}]: ${message}${logData}`;
  }

  // Format message for console with colors
  function formatConsoleMessage(level, message, data = null) {
    if (!opts.useColors) {
      return formatLogMessage(level, message, data);
    }

    let color;
    switch (level) {
      case 'DEBUG':
        color = colors.cyan;
        break;
      case 'INFO':
        color = colors.green;
        break;
      case 'WARN':
        color = colors.yellow;
        break;
      case 'ERROR':
        color = colors.red;
        break;
      default:
        color = colors.reset;
    }

    const timestamp = new Date().toISOString();
    let logData = '';

    if (data) {
      if (typeof data === 'object') {
        try {
          logData = '\n' + JSON.stringify(data, null, 2);
        } catch (e) {
          logData = `\n[Error serializing data: ${e.message}]`;
        }
      } else {
        logData = `\n${data}`;
      }
    }

    return `${color}[${level}]${colors.reset} ${colors.brightBlue}${timestamp}${colors.reset} [${colors.brightMagenta}${opts.serviceName}${colors.reset}]: ${message}${logData}`;
  }

  // Write to log file
  function writeToFile(message) {
    if (!opts.logToFile) return;

    try {
      // Check if we need to rotate the log
      if (opts.maxFileSize && fs.existsSync(opts.logFilePath)) {
        const stats = fs.statSync(opts.logFilePath);
        if (stats.size >= opts.maxFileSize) {
          // Rotate logs
          rotateLogFiles();
        }
      }

      // Append message to log file
      fs.appendFileSync(opts.logFilePath, message + '\n');
    } catch (e) {
      console.error(
        `Error writing to log file ${opts.logFilePath}:`,
        e.message
      );
    }
  }

  // Rotate log files
  function rotateLogFiles() {
    try {
      // Delete the oldest log file if it exists
      const oldestLog = `${opts.logFilePath}.${opts.maxFiles}`;
      if (fs.existsSync(oldestLog)) {
        fs.unlinkSync(oldestLog);
      }

      // Shift each existing log file
      for (let i = opts.maxFiles - 1; i >= 1; i--) {
        const oldFile = `${opts.logFilePath}.${i}`;
        const newFile = `${opts.logFilePath}.${i + 1}`;
        if (fs.existsSync(oldFile)) {
          fs.renameSync(oldFile, newFile);
        }
      }

      // Rename the current log file
      if (fs.existsSync(opts.logFilePath)) {
        fs.renameSync(opts.logFilePath, `${opts.logFilePath}.1`);
      }
    } catch (e) {
      console.error(`Error rotating log files:`, e.message);
    }
  }

  // Define the log function for each level
  function log(level, levelValue, message, data = null) {
    if (levelValue < opts.logLevel) return;

    const fileMessage = formatLogMessage(level, message, data);
    const consoleMessage = formatConsoleMessage(level, message, data);

    if (opts.logToFile) {
      writeToFile(fileMessage);
    }

    if (opts.logToConsole) {
      if (level === 'ERROR') {
        console.error(consoleMessage);
      } else if (level === 'WARN') {
        console.warn(consoleMessage);
      } else {
        console.log(consoleMessage);
      }
    }

    return { level, message, timestamp: new Date().toISOString() };
  }

  // Return the logger object with methods for each log level
  return {
    debug: (message, data) => log('DEBUG', LOG_LEVELS.DEBUG, message, data),
    info: (message, data) => log('INFO', LOG_LEVELS.INFO, message, data),
    warn: (message, data) => log('WARN', LOG_LEVELS.WARN, message, data),
    error: (message, data) => log('ERROR', LOG_LEVELS.ERROR, message, data),

    // Method to change log level at runtime
    setLogLevel: (level) => {
      if (LOG_LEVELS.hasOwnProperty(level)) {
        opts.logLevel = LOG_LEVELS[level];
      } else if (typeof level === 'number' && level >= 0 && level <= 4) {
        opts.logLevel = level;
      }
    },

    // Get current settings
    getSettings: () => ({ ...opts }),

    // Log levels constants
    LOG_LEVELS,
  };
}

module.exports = {
  createLogger,
  LOG_LEVELS,
};
