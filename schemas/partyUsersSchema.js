const partyUsersSchema = {
  phone: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: "",
    maxlength: 160,
  },
  password: {
    type: String,
    required: true,
    default: "",
  },
  firstName: {
    type: String,
    trim: true,
    default: "",
    maxlength: 100,
  },
  secondName: {
    type: String,
    trim: true,
    default: "",
    maxlength: 100,
  },
  role: {
    type: String,
    enum: ["user", "support", "admin"],
    default: "user",
  },
  interfaceRoles: {
    type: [String],
    enum: ["company", "performer"],
    default: [],
  },
  lastWorkspace: {
    type: String,
    enum: ["", "company", "performer"],
    default: "",
  },
  performerOnboardingCompletedAt: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ["active", "blocked", "archived"],
    default: "active",
  },
  consentPrivacyPolicyAccepted: {
    type: Boolean,
    default: false,
  },
  consentPersonalDataAccepted: {
    type: Boolean,
    default: false,
  },
  privacyPolicyAcceptedAt: {
    type: Date,
    default: null,
  },
  personalDataProcessingAcceptedAt: {
    type: Date,
    default: null,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
}

export default partyUsersSchema
