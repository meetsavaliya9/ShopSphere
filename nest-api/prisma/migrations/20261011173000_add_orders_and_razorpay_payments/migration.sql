CREATE TABLE `Order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `status` ENUM('PAYMENT_PENDING', 'PAID', 'PAYMENT_FAILED') NOT NULL DEFAULT 'PAYMENT_PENDING',
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `shippingAddress` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `Order_userId_createdAt_idx` (`userId`, `createdAt`),
    INDEX `Order_status_createdAt_idx` (`status`, `createdAt`),
    UNIQUE INDEX `Order_userId_idempotencyKey_key` (`userId`, `idempotencyKey`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OrderItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `productId` INTEGER NULL,
    `productName` VARCHAR(191) NOT NULL,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `OrderItem_orderId_idx` (`orderId`),
    INDEX `OrderItem_productId_idx` (`productId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Payment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `razorpayOrderId` VARCHAR(64) NULL,
    `razorpayPaymentId` VARCHAR(64) NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `status` ENUM('PENDING', 'CAPTURED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `failureCode` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Payment_orderId_key` (`orderId`),
    UNIQUE INDEX `Payment_razorpayOrderId_key` (`razorpayOrderId`),
    UNIQUE INDEX `Payment_razorpayPaymentId_key` (`razorpayPaymentId`),
    INDEX `Payment_status_createdAt_idx` (`status`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Payment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaymentWebhookEvent` (
    `eventId` VARCHAR(100) NOT NULL,
    `eventType` VARCHAR(100) NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
