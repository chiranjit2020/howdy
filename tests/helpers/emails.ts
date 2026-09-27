/**
 * The email cases from the "Email Validation Security Test (P0)" brief, shared by the unit test (the schema) and the
 * security test (the sign-up API with the browser bypassed), so both check exactly the same list.
 */
export const INVALID_EMAILS: readonly string[] = [
  // From the brief.
  'test',
  'test@',
  '@test.com',
  'test@test',
  'test@test.',
  'test@.com',
  'test..test@gmail.com',
  'test @gmail.com',
  'test@gmail',
  '123@123',
  '123@123.',
  '123@123.com',
  '42@7.co.in',
  'a@b',
  'abc',
  'hello',
  'user@localhost',
  'user@[127.0.0.1]',
  // Empty, several @, dots at the edges, missing domain or TLD.
  '',
  '   ',
  'a@@example.com',
  'a@b@example.com',
  '.a@example.com',
  'a.@example.com',
  'a@example..com',
  'a@.example.com',
  'a@example',
  'a@example.c',
  'a@example.123',
  'a@1.2.3.4',
  // Domain parts that start or end with a hyphen.
  'a@-example.com',
  'a@example-.com',
  // Invalid characters, quotes, control characters.
  'a<b>@example.com',
  '"a b"@example.com',
  'a,b@example.com',
  'a;b@example.com',
  'a\u0000@example.com',
  'a\t@example.com',
  // Unicode and homographs: Cyrillic letters, an IDN domain, and its punycode form.
  'пример@example.com',
  'a@пример.рф',
  'a@exаmple.com', // the "а" is Cyrillic
  'a@xn--80ak6aa92e.com',
  // Too long: over 254 in all, and a local part over 64.
  `${'x'.repeat(1000)}@example.com`,
  `${'x'.repeat(65)}@example.com`,
  // Injection-shaped input.
  "'; drop table users; --@example.com",
  '<script>alert(1)</script>@example.com',
  'a@example.com<script>',
];

/** Must be accepted, and stored exactly as the right-hand value (trimmed, lowercased). */
export const VALID_EMAILS: readonly (readonly [string, string])[] = [
  ['chiranjit@example.com', 'chiranjit@example.com'],
  ['codeworm.dev@gmail.com', 'codeworm.dev@gmail.com'],
  ['hello.world@learncomputer.in', 'hello.world@learncomputer.in'],
  ['name.surname@company.co.in', 'name.surname@company.co.in'],
  ['user+tag@gmail.com', 'user+tag@gmail.com'],
  ['  Chiranjit.K@Example.COM  ', 'chiranjit.k@example.com'],
  ["o'brien@example.ie", "o'brien@example.ie"], // apostrophes are legal and harmless (queries are parameterised)
  [`${'x'.repeat(64)}@example.com`, `${'x'.repeat(64)}@example.com`],
  // Digits on one side only are real addresses (QQ numbers, 163.com); only digits on BOTH sides are refused.
  ['12345@qq.com', '12345@qq.com'],
  ['me@163.com', 'me@163.com'],
  ['9876543210@gmail.com', '9876543210@gmail.com'],
];
