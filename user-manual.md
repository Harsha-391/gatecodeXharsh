# HMS End-User Operations Manual

This guide maps out the role-specific operational steps for clinic staff using the Hospital Management System (HMS).

---

## 1. Receptionist: Patient Registration & Booking

1. Navigate to **Receptionist Dashboard**.
2. Click **Register Patient** to enroll new outpatients. Enter their name, contact, Aadhaar Number, and demographics.
3. To book an appointment, click **Book Appointment**, select the target doctor, set the date and time, and select the clinic service.
4. Issue booking token/receipt upon payment confirmation.

---

## 2. Doctor: Clinical Consultations & Prescriptions

1. Navigate to **Doctor Dashboard** to view your scheduled queue.
2. Click **Start Consult** on a patient record.
3. Record symptoms, diagnostics, and prescription items (medicines, dosages, and durations).
4. If the patient requires clinical tests, select the target tests under the **Prescribe Lab Tests** segment.
5. If the patient requires inpatient stay, click **Recommend Admission**. This routes a flag request instantly to the Receptionist queue.

---

## 3. Nurse: Inpatient Care & Bed Allocation

1. View the **Ward Admissions Queue** from your dashboard.
2. Assign beds to patients recommended for admission.
3. Record vitals (weight, height, blood pressure, temperature, heart rate).
4. Add facility charges for ward stays (e.g. ICU charges, general ward fees) which will consolidate directly into the patient's billing.

---

## 4. Lab Technician: Test Collection & Lab Reports

1. Access the **Lab Queue** to see patients with pending samples.
2. Click **Collect Sample** when blood/urine/saliva is gathered.
3. Process the sample in the lab. Once complete, upload the report PDF.
4. Click **Complete Test** to register the status as `Report Ready`.

---

## 5. Pharmacist: Inventory & Order Dispensing

1. View pending prescriptions from the **Pharmacy Queue**.
2. Retrieve the required medicines from inventory catalog.
3. Click **Complete Order** to update the stocks. Low stock warnings will trigger automatically when medicine counts fall below 50 units.

---

## 6. Accountant / Billing Clerk: Payments & Refunds

1. Look up patient records using MRN, Invoice Number, or Patient Name in the **Billing Dashboard**.
2. Review consolidated invoices containing consultations, lab tests, pharmacy orders, and ward charges.
3. Click **Collect Payment** and record the payment method (Cash, Card, UPI, or Bank Transfer).
4. For patient returns or duplicate payments, create a **Refund Request** and route it to the hospital administrator for approval.
