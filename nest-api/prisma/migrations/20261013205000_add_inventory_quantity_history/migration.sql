ALTER TABLE `Product`
    ADD COLUMN `stockQuantity` INTEGER NULL,
    ADD COLUMN `lowStockThreshold` INTEGER NULL;

CREATE TABLE `inventorystockhistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NULL,
    `userId` INTEGER NULL,
    `productName` VARCHAR(191) NOT NULL,
    `previousQuantity` INTEGER NULL,
    `newQuantity` INTEGER NULL,
    `quantityChange` INTEGER NULL,
    `previousInStock` BOOLEAN NULL,
    `newInStock` BOOLEAN NULL,
    `actionType` VARCHAR(24) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryStockHistory_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `InventoryStockHistory_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `InventoryStockHistory_productId_fkey`
        FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
   CONSTRAINT `InventoryStockHistory_userId_fkey`
        FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
