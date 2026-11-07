// src/validate.js — input validation for every write endpoint.
//
// Each validator returns an error message string, or null when the input
// is valid. The route layer turns a non-null return into a 400 JSON error
// before any data is touched.

const { VALID_STATUSES, VALID_ATTENDANCE } = require('./db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body);
}

function validateStudentInput(body, { partial = false } = {}) {
  if (!isObject(body)) return 'Request body must be a JSON object.';
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return 'Student name is required and must be a non-empty string.';
    }
  }
  if (body.email !== undefined && body.email !== '') {
    if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) {
      return 'Email must be a valid email address.';
    }
  }
  if (body.cohortId !== undefined && body.cohortId !== null && typeof body.cohortId !== 'string') {
    return 'cohortId must be a string.';
  }
  return null;
}

function validateLabInput(body, { partial = false } = {}) {
  if (!isObject(body)) return 'Request body must be a JSON object.';
  if (!partial || body.studentId !== undefined) {
    if (typeof body.studentId !== 'string' || body.studentId.trim() === '') {
      return 'studentId is required and must reference an existing student.';
    }
  }
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return 'Lab title is required and must be a non-empty string.';
    }
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return `Status must be one of: ${VALID_STATUSES.join(', ')}.`;
  }
  if (body.score !== undefined && body.score !== null) {
    if (!Number.isInteger(body.score) || body.score < 0 || body.score > 100) {
      return 'Score must be a whole number from 0 to 100, or null to clear it.';
    }
  }
  return null;
}

function validateAttendanceInput(body) {
  if (!isObject(body)) return 'Request body must be a JSON object.';
  if (typeof body.studentId !== 'string' || body.studentId.trim() === '') {
    return 'studentId is required.';
  }
  if (typeof body.date !== 'string' || !DATE_RE.test(body.date)) {
    return 'date is required and must look like YYYY-MM-DD.';
  }
  if (!VALID_ATTENDANCE.includes(body.status)) {
    return `Status must be one of: ${VALID_ATTENDANCE.join(', ')}.`;
  }
  if (body.note !== undefined && typeof body.note !== 'string') {
    return 'note must be a string.';
  }
  return null;
}

function validateTemplateInput(body) {
  if (!isObject(body)) return 'Request body must be a JSON object.';
  if (typeof body.moduleId !== 'string' || body.moduleId.trim() === '') {
    return 'moduleId is required.';
  }
  if (typeof body.title !== 'string' || body.title.trim() === '') {
    return 'Lab template title is required and must be a non-empty string.';
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    return 'description must be a string.';
  }
  return null;
}

function validateSettingsInput(body) {
  if (!isObject(body)) return 'Request body must be a JSON object.';
  if (body.pass_mark !== undefined) {
    if (!Number.isInteger(body.pass_mark) || body.pass_mark < 0 || body.pass_mark > 100) {
      return 'pass_mark must be a whole number from 0 to 100.';
    }
  }
  if (body.at_risk_progress !== undefined) {
    if (!Number.isInteger(body.at_risk_progress) || body.at_risk_progress < 0 || body.at_risk_progress > 100) {
      return 'at_risk_progress must be a whole number from 0 to 100.';
    }
  }
  return null;
}

module.exports = {
  validateStudentInput,
  validateLabInput,
  validateAttendanceInput,
  validateTemplateInput,
  validateSettingsInput,
};
