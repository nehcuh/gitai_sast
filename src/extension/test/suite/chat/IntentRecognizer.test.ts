import * as assert from 'assert';
import { IntentRecognizer, Intent } from '../../../src/chat/nlp/IntentRecognizer';

suite('IntentRecognizer Test Suite', () => {
  test('should recognize explain intent', () => {
    const result = IntentRecognizer.recognize('explain this vulnerability');
    assert.strictEqual(result.intent, Intent.Explain);
  });

  test('should recognize explain intent with what is', () => {
    const result = IntentRecognizer.recognize('what is this?');
    assert.strictEqual(result.intent, Intent.Explain);
  });

  test('should recognize fix intent', () => {
    const result = IntentRecognizer.recognize('fix this code');
    assert.strictEqual(result.intent, Intent.Fix);
  });

  test('should recognize fix intent with repair', () => {
    const result = IntentRecognizer.recognize('repair this bug');
    assert.strictEqual(result.intent, Intent.Fix);
  });

  test('should recognize taint intent', () => {
    const result = IntentRecognizer.recognize('show me the taint path');
    assert.strictEqual(result.intent, Intent.Taint);
  });

  test('should recognize taint intent with flow', () => {
    const result = IntentRecognizer.recognize('what is the data flow?');
    assert.strictEqual(result.intent, Intent.Taint);
  });

  test('should recognize scan intent', () => {
    const result = IntentRecognizer.recognize('scan this file');
    assert.strictEqual(result.intent, Intent.Scan);
  });

  test('should recognize scan intent with check', () => {
    const result = IntentRecognizer.recognize('check for vulnerabilities');
    assert.strictEqual(result.intent, Intent.Scan);
  });

  test('should return unknown intent for unrecognized input', () => {
    const result = IntentRecognizer.recognize('hello world');
    assert.strictEqual(result.intent, Intent.Unknown);
  });

  test('should extract parameters from input', () => {
    const paramPatterns = {
      ruleId: /rule\s*id\s*[:\s]*([a-z0-9\.-]+)/i,
    };
    const params = IntentRecognizer.extractParams(
      'explain rule id: test.rule.123',
      paramPatterns
    );
    assert.strictEqual(params.ruleId, 'test.rule.123');
  });

  test('should handle case insensitive extraction', () => {
    const paramPatterns = {
      ruleId: /rule\s*id\s*[:\s]*([a-z0-9\.-]+)/i,
    };
    const params = IntentRecognizer.extractParams(
      'RULE ID: TEST.RULE',
      paramPatterns
    );
    assert.strictEqual(params.ruleId, 'TEST.RULE');
  });

  test('should handle missing parameters', () => {
    const paramPatterns = {
      ruleId: /rule\s*id\s*[:\s]*([a-z0-9\.-]+)/i,
    };
    const params = IntentRecognizer.extractParams(
      'explain this',
      paramPatterns
    );
    assert.strictEqual(params.ruleId, undefined);
  });

  test('should extract multiple parameters', () => {
    const paramPatterns = {
      ruleId: /rule\s*id\s*[:\s]*([a-z0-9\.-]+)/i,
      line: /line\s*[:\s]*(\d+)/i,
    };
    const params = IntentRecognizer.extractParams(
      'explain rule id: test.rule on line: 42',
      paramPatterns
    );
    assert.strictEqual(params.ruleId, 'test.rule');
    assert.strictEqual(params.line, '42');
  });

  test('should handle complex natural language', () => {
    const result = IntentRecognizer.recognize(
      'Can you please help me explain what this vulnerability is?'
    );
    assert.strictEqual(result.intent, Intent.Explain);
  });

  test('should handle mixed case input', () => {
    const result = IntentRecognizer.recognize('FIX This Bug NOW');
    assert.strictEqual(result.intent, Intent.Fix);
  });

  test('should handle input with punctuation', () => {
    const result = IntentRecognizer.recognize('scan this file, please!');
    assert.strictEqual(result.intent, Intent.Scan);
  });

  test('should prioritize explicit commands', () => {
    const result = IntentRecognizer.recognize('@sast fix');
    assert.strictEqual(result.intent, Intent.Fix);
  });
});
