-- CreateIndex
CREATE INDEX "Appointment_notificationSent_startTime_idx" ON "Appointment"("notificationSent", "startTime");
