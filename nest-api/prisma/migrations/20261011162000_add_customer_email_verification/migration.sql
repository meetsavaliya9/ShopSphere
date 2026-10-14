ALTER TABLE `User`
    ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `otpChallengeId` CHAR(64) NULL,
    ADD COLUMN `otpCodeHash` CHAR(64) NULL,
    ADD COLUMN `otpExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `otpResendAfter` DATETIME(3) NULL,
    ADD COLUMN `otpAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `otpPurpose` VARCHAR(16) NULL;

CREATE UNIQUE INDEX `User_otpChallengeId_key` ON `User`(`otpChallengeId`);
