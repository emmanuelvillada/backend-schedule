-- CreateTable
CREATE TABLE "BusinessClosure" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessClosure_businessId_idx" ON "BusinessClosure"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessClosure_businessId_date_key" ON "BusinessClosure"("businessId", "date");

-- AddForeignKey
ALTER TABLE "BusinessClosure" ADD CONSTRAINT "BusinessClosure_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
