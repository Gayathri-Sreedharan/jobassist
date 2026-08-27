const SKILLS = [
  "Python",
  "SQL",
  "Java",
  "C++",
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Excel",
  "Power BI",
  "Tableau",
  "Pandas",
  "NumPy",
  "Scikit-learn",
  "TensorFlow",
  "PyTorch",
  "Machine Learning",
  "Deep Learning",
  "Artificial Intelligence",
  "Generative AI",
  "GenAI",
  "LLM",
  "NLP",
  "RAG",
  "AWS",
  "Azure",
  "GCP",
  "Docker",
  "Kubernetes",
  "DevOps",
  "Git",
  "Linux",
  "Cybersecurity",
  "SOC",
  "SIEM",
  "Network Security",
  "Cloud Security",
  "Information Security"
];

function extractSkills(text = "") {
  const lowerText = text.toLowerCase();

  return SKILLS.filter((skill) =>
    lowerText.includes(skill.toLowerCase())
  ).join(", ");
}

module.exports = {
  extractSkills
};