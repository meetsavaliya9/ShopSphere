ALTER TABLE `user`
    MODIFY `role` ENUM('ADMIN', 'MANAGER', 'CUSTOMER', 'INVENTORY_MANAGER') NOT NULL DEFAULT 'CUSTOMER';

CREATE TABLE `inventorymanagerpermission` (
    `userId` INTEGER NOT NULL,
    `permission` VARCHAR(64) NOT NULL,

    INDEX `InventoryManagerPermission_permission_idx`(`permission`),
    PRIMARY KEY (`userId`, `permission`),
    CONSTRAINT `InventoryManagerPermission_userId_fkey`
        FOREIGN KEY (`userId`) REFERENCES `user`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
