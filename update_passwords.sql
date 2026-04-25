-- Local one-off password updates. Replace hashes using /api/test/hash?password=...
-- Optional personal HEAD_ADMIN from .env: see PersonalHeadAdminSeeder (SEED_PERSONAL_HEAD_ADMIN_*).

UPDATE users
SET password_hash = '$2a$10$ZU65cjQQJ3DVvMkxP//c9usnzkBombPqud6tk2tk5mb/CTjwHk646'
WHERE username = 'headadmin@gmail.com';

UPDATE users
SET password_hash = '$2a$10$os8XhRmsacrrBeCWn6BUSOGIewUftJryycrS.ILplujJ8zCRqE2gG'
WHERE username = 'admin@gmail.com';

UPDATE users
SET password_hash = '$2a$10$kpNSkRGKAEbHimYZBLOoC.6Ya2sdEKpecfNKdb96NH1Dp80y9O1Uy'
WHERE username = 'worker@gmail.com';

UPDATE users
SET password_hash = '$2a$10$R.OWe2fxsEWzjtaKzMBDh.iidEvNvF6mjXT4t3ZMoVHOzC/DN6fUm'
WHERE username = 'headadmin-primary@local.test';
