// Interview-style prompts for English practice.
// `custom: true` marks the "Custom prompt" entry where the user types their own
// question in the UI. Every entry is a single string — the prompt shown to the
// user (and sent to the model).

const CATEGORIES = [
  {
    id: "about-yourself",
    label: "Tell me about yourself",
    prompt: "Tell me about yourself.",
  },
  {
    id: "weakness",
    label: "Biggest weakness",
    prompt: "What's your biggest weakness as a developer?",
  },
  {
    id: "strength",
    label: "Biggest strength",
    prompt: "What's your biggest strength as a developer?",
  },
  {
    id: "why-company",
    label: "Why this company",
    prompt: "Why do you want to work at our company?",
  },
  {
    id: "five-years",
    label: "Where do you see yourself in 5 years",
    prompt: "Where do you see yourself in 5 years?",
  },
  {
    id: "project",
    label: "Tell me about a project",
    prompt: "Tell me about a project you're proud of. What did you build and what was your role?",
  },
  {
    id: "challenge",
    label: "Tell me about a challenge",
    prompt: "Tell me about a technical challenge you faced and how you solved it.",
  },
  {
    id: "questions",
    label: "Any questions for me",
    prompt: "Do you have any questions for me?",
  },
  {
    id: "custom",
    label: "Custom prompt",
    prompt: "",
    custom: true,
  },
];

module.exports = { CATEGORIES };
