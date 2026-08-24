// Purely synthetic demo identities - no real customer PII. Names are common
// Indian first/last name combinations used only to make the dashboard
// legible; emails/phones are synthetic (@example.test / 9000000000 range).

export const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna",
  "Ishaan", "Rohan", "Kabir", "Aryan", "Dhruv", "Karan", "Yash", "Anaya",
  "Diya", "Saanvi", "Ananya", "Ira", "Myra", "Aadhya", "Kavya", "Riya",
  "Priya", "Neha", "Pooja", "Sneha", "Isha", "Meera", "Rahul", "Amit",
  "Vikram", "Sanjay", "Rajesh", "Suresh", "Anjali", "Kiran", "Deepa", "Nikhil",
];
export const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Patel", "Iyer", "Nair", "Reddy", "Rao",
  "Menon", "Pillai", "Joshi", "Mehta", "Kapoor", "Malhotra", "Chatterjee", "Bose",
  "Das", "Bhatt", "Agarwal", "Singh", "Kumar", "Yadav", "Chauhan", "Trivedi",
];

export const CITIES = ["Mumbai", "Bengaluru", "Delhi", "Hyderabad", "Pune", "Chennai", "Kolkata", "Ahmedabad", "Jaipur", "Kochi"];

export const AMOUNT_TIERS_PAISE = [
  29900, 79900, 149900, 499900, 1200000, 2500000, 7500000, 15000000,
];

export const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet", "emi"] as const;

export const FAILURE_SAMPLES: { errorCode: string; errorDescription: string; errorSource: string; errorStep: string; errorReason: string }[] = [
  { errorCode: "BAD_REQUEST_ERROR", errorDescription: "Payment failed due to insufficient funds in the account.", errorSource: "bank", errorStep: "payment_authorization", errorReason: "insufficient_funds" },
  { errorCode: "GATEWAY_ERROR", errorDescription: "Card declined by issuing bank (temporary issue).", errorSource: "issuer", errorStep: "payment_authorization", errorReason: "payment_declined" },
  { errorCode: "BAD_REQUEST_ERROR", errorDescription: "Incorrect OTP entered during authentication.", errorSource: "customer", errorStep: "payment_authentication", errorReason: "otp_incorrect" },
  { errorCode: "GATEWAY_ERROR", errorDescription: "The card has expired.", errorSource: "issuer", errorStep: "payment_authorization", errorReason: "card_expired" },
  { errorCode: "SERVER_ERROR", errorDescription: "Payment gateway timeout - please retry.", errorSource: "gateway", errorStep: "payment_initiation", errorReason: "gateway_timeout" },
  { errorCode: "BAD_REQUEST_ERROR", errorDescription: "Transaction declined by issuing bank.", errorSource: "bank", errorStep: "payment_authorization", errorReason: "issuer_declined" },
];

export function fullName(rng: () => number): { first: string; last: string } {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  return { first, last };
}
