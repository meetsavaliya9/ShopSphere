ALTER TABLE `product`
    ADD COLUMN `lowStockAlertActive` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `lowStockAlertAt` DATETIME(3) NULL;

ALTER TABLE `order`
    ADD COLUMN `inventoryDeducted` BOOLEAN NOT NULL DEFAULT false;
