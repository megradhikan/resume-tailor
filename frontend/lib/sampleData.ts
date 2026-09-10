// Canned example output so the demo is fully explorable even when the
// backend (Groq-backed FastAPI on Railway) is unreachable or its free-tier
// quota is exhausted. Wired to a "Try a sample" button on the input form —
// it renders real UI states without a network call.

import {
  AnalysisResult,
  RewriteSuggestion,
  GroundingViolation,
  InterviewQuestion,
  ParagraphGrounding,
} from "./api";

export const sampleResumeText = `Jane Doe
Software Engineer

EXPERIENCE
Backend Engineer, Northwind Logistics (2021–present)
- Built and maintained REST APIs in Python serving 2M+ requests/day
- Migrated a monolithic order-processing service to microservices, cutting deploy time by 40%
- Wrote CI/CD pipelines in GitHub Actions and Docker for 6 services
- Worked with PostgreSQL, Redis, and AWS (EC2, S3, Lambda)
- Mentored 2 junior engineers on code review and system design

Software Engineer, Bitwave Analytics (2019–2021)
- Built data ingestion pipelines processing 500GB/day of event data
- Implemented monitoring dashboards using Grafana and Prometheus

SKILLS
Python, Go, FastAPI, PostgreSQL, Redis, AWS, Docker, Kubernetes, CI/CD, Grafana`;

export const sampleJobDescription = `We are looking for a Senior Backend Engineer to join our platform team.

Requirements:
- 5+ years of experience with Python
- Strong knowledge of distributed systems
- Experience with Kubernetes and Terraform
- Familiarity with event-driven architecture (Kafka)
- Experience mentoring engineers

Preferred:
- Experience with Go
- GraphQL
- Observability tooling (Datadog, Prometheus)`;

export const sampleCompanyName = "Meridian Systems";
export const sampleRoleTitle = "Senior Backend Engineer";

export const sampleAnalysis: AnalysisResult = {
  ats_score: 68.4,
  seniority_match: "match",
  jd_summary:
    "Senior backend role on a platform team emphasizing distributed systems, container orchestration, and event-driven infrastructure, with mentorship expected.",
  matched_keywords: [
    { keyword: "Python", resume_evidence: "Built and maintained REST APIs in Python serving 2M+ requests/day" },
    { keyword: "Kubernetes", resume_evidence: "Skills: ... Kubernetes ..." },
    { keyword: "mentoring", resume_evidence: "Mentored 2 junior engineers on code review and system design" },
    { keyword: "Go", resume_evidence: "Skills: Python, Go, FastAPI ..." },
    { keyword: "Prometheus", resume_evidence: "Implemented monitoring dashboards using Grafana and Prometheus" },
  ],
  missing_keywords: [
    { keyword: "Terraform", importance: "required", jd_evidence: "Experience with Kubernetes and Terraform" },
    { keyword: "Kafka", importance: "required", jd_evidence: "familiarity with event-driven architecture (Kafka)" },
    { keyword: "GraphQL", importance: "preferred", jd_evidence: "Preferred: ... GraphQL" },
    { keyword: "Datadog", importance: "preferred", jd_evidence: "observability tooling (Datadog, Prometheus)" },
  ],
  skill_gaps: [
    {
      skill: "Terraform",
      has_adjacent_experience: true,
      notes: "Resume shows hands-on AWS provisioning (EC2, S3, Lambda) but no IaC tool named — Terraform not evidenced.",
      resume_section_ref: "Backend Engineer, Northwind Logistics",
    },
    {
      skill: "Kafka",
      has_adjacent_experience: false,
      notes: "No event-driven or message-queue experience found in resume.",
      resume_section_ref: "n/a",
    },
  ],
};

export const sampleRewrites: RewriteSuggestion[] = [
  {
    section: "Backend Engineer, Northwind Logistics",
    original_line: "Built and maintained REST APIs in Python serving 2M+ requests/day",
    suggested_line:
      "Built and maintained distributed REST APIs in Python serving 2M+ requests/day across a multi-service backend",
    reason: "Surfaces 'distributed systems' language from the JD using only what the resume already describes.",
    grounded_in: "original bullet — same system, no new claim",
  },
  {
    section: "Backend Engineer, Northwind Logistics",
    original_line: "Migrated a monolithic order-processing service to microservices, cutting deploy time by 40%",
    suggested_line:
      "Led migration of a monolithic order-processing service to microservices, cutting deploy time by 40% and enabling independent service scaling",
    reason: "Adds the scaling outcome that a microservices migration implies, and calls out ownership ('led').",
    grounded_in: "same bullet — outcome is a direct consequence of the described migration",
  },
  {
    section: "Skills",
    original_line: "Python, Go, FastAPI, PostgreSQL, Redis, AWS, Docker, Kubernetes, CI/CD, Grafana",
    suggested_line:
      "Python, Go, FastAPI, PostgreSQL, Redis, AWS (EC2, S3, Lambda), Docker, Kubernetes, CI/CD, Grafana, Prometheus",
    reason: "Groups AWS services already listed in the experience bullet, and surfaces Prometheus from the second role.",
    grounded_in: "AWS services from Northwind bullet; Prometheus from Bitwave Analytics bullet",
  },
];

export const sampleGroundingViolations: GroundingViolation[] = [];

export const sampleCoverLetterDraft = `Dear Hiring Team,

I'm writing to apply for the Senior Backend Engineer role at Meridian Systems. In my current role at Northwind Logistics, I've spent the last three years building and operating the backend systems behind a high-throughput order-processing platform — including leading its migration from a monolith to microservices, which cut deploy time by 40%.

Your team's focus on distributed systems and container orchestration lines up closely with what I do day to day: I run production services on Kubernetes, and I've built the CI/CD pipelines that ship them. I haven't worked directly with Terraform or Kafka, but I've provisioned and managed the underlying AWS infrastructure (EC2, S3, Lambda) those tools typically sit on top of, and I'm confident picking up both quickly.

Mentorship is something I actively look for in a role — I've mentored two junior engineers through code review and system design at Northwind, and I'd welcome doing more of that on a larger platform team.

I'd welcome the chance to talk about how my background fits what you're building.

Sincerely,
Jane Doe`;

export const sampleCoverLetterGrounding: ParagraphGrounding[] = [
  { paragraph_index: 0, grounded_in: ["Backend Engineer, Northwind Logistics — role summary"] },
  { paragraph_index: 1, grounded_in: ["Kubernetes, CI/CD skills", "AWS (EC2, S3, Lambda) experience"] },
  { paragraph_index: 2, grounded_in: ["Mentored 2 junior engineers on code review and system design"] },
];

export const sampleInterviewQuestions: InterviewQuestion[] = [
  {
    question: "Walk me through the monolith-to-microservices migration you led. What broke first?",
    category: "technical",
    relevant_resume_points: ["Migrated a monolithic order-processing service to microservices, cutting deploy time by 40%"],
    suggested_talking_points: [
      "What triggered the migration (deploy pain, scaling limits, team ownership boundaries)",
      "How you sequenced the split to avoid a big-bang cutover",
      "One concrete failure mode you hit and how you caught it",
    ],
  },
  {
    question: "Tell me about a time you mentored someone through a decision they initially got wrong.",
    category: "behavioral",
    relevant_resume_points: ["Mentored 2 junior engineers on code review and system design"],
    suggested_talking_points: [
      "Describe the specific design or code decision, not just 'I gave feedback'",
      "How you balanced correcting the approach with letting them own the fix",
    ],
  },
  {
    question: "You haven't used Kafka before — how would you approach ramping up on event-driven architecture here?",
    category: "gap_probe",
    relevant_resume_points: ["No message-queue or event-driven experience listed on resume"],
    suggested_talking_points: [
      "Draw the parallel to request-driven systems you've built and where the mental model differs",
      "Name a concrete way you'd de-risk the ramp-up (pairing, a small pilot topic, reading the team's existing consumers)",
      "Don't overclaim — this is a real gap; the interviewer already knows it from your resume",
    ],
  },
];
