# Frontend QA — Test Plan & Results

Owner: Member 3 (Frontend Development, Document Processing & System Integration)
Scope: all 8 user-facing pages, per "9. Testing and Quality Assurance" in the
role responsibilities doc.

Legend: ✅ Pass · ⚠️ Partial / known gap · ❌ Fail · ⏳ Not yet tested

## 1. User registration & login
| Test case | Result | Notes |
|---|---|---|
| Sign-up form renders, password requirement checklist updates live | ✅ | `auth.js` handles this client-side |
| Submitting sign-up form | ⚠️ | No backend `/api/auth/register` exists yet — see `backend/API_CONTRACT_NEEDED.md`. UI validation works; nothing is actually created/stored. |
| Login form validation (empty fields, bad email) | ✅ | |
| Submitting login form | ⚠️ | Same blocker — no `/api/auth/login` yet |
| Password visibility toggle | ✅ | |

## 2. File uploads (Simplifier / Risk Analyzer / Comparison)
| Test case | Result | Notes |
|---|---|---|
| Upload a valid PDF to Document Simplifier | ✅ | Hits real `/api/document-simplifier`, returns Gemini-generated summary |
| Upload a valid PDF to Risk Analyzer | ✅ | Hits real `/api/risk-analyzer` |
| Upload a non-PDF file | ⏳ | Needs manual check — confirm frontend blocks before hitting backend (backend also rejects non-PDF with 400) |
| Upload a file over 10MB | ⏳ | Backend enforces `MAX_UPLOAD_BYTES`; confirm frontend shows a clear message rather than a raw error |
| Upload two PDFs to Document Comparison | ⚠️ | Page only produces a static generic checklist — does not call any backend endpoint or read the actual file contents. Needs `/api/document-comparison` (see contract doc) to be a real comparison. |

## 3. Chatbot queries (Legal Companion)
| Test case | Result | Notes |
|---|---|---|
| Ask a question with no document attached | ✅ | Hits `/api/companion/chat` |
| Attach a document, then ask a grounded question | ✅ | Uses `/api/companion/documents` + `/api/companion/chat` |
| Remove an attached document mid-conversation | ✅ | Calls `DELETE /api/companion/documents/{id}` |
| Chat history persists across page reload | ✅ | Stored in `localStorage` |
| Loading indicator shows while waiting for a response | ✅ | |

## 4. Document simplification / risk analysis output
| Test case | Result | Notes |
|---|---|---|
| Simplifier output is readable and well-formatted | ✅ | Markdown stripped to plain text per `32a0173` commit |
| Risk Analyzer shows a clear risk level | ✅ | |
| Error state shown when Gemini call fails (e.g. bad/missing API key) | ⏳ | Needs manual test — try running without `GOOGLE_API_KEY` set and confirm the UI shows a readable error, not a broken page |

## 5. Notice generation
| Test case | Result | Notes |
|---|---|---|
| Fill form, generate notice | ✅ | Fully client-side, no backend dependency |
| Copy button copies generated text | ✅ | |
| Print button | ⏳ | Needs manual check across browsers |

## 6. Navigation / cross-page consistency
| Test case | Result | Notes |
|---|---|---|
| All nav links resolve to real files | ✅ | Verified — fixed one bug: `RiskAnalyzer_LegalSimple.html` renamed to `risk-analyzer.html` for consistency with every other page, updated 15 references across 7 files |
| Shared header/footer consistent across pages | ⏳ | Spot-check each page in-browser |
| Mobile / responsive layout | ⏳ | Needs manual check at common breakpoints (375px, 768px, 1024px) |

## Known gaps to raise with the team before Aug 23
1. **No backend auth** — sign-up/login UI works but doesn't persist anything. Decide: build `/api/auth/*` before the demo, or present it as "UI complete, integration pending" and demo the other 3 AI features live instead.
2. **Document Comparison isn't wired to the backend** — currently a static generic checklist, not an actual document diff. Same decision needed.
3. Error-state and edge-case testing (oversized files, wrong file types, API failures) still needs to be run manually and recorded here.

## How to keep this updated
Re-run the ⏳ rows manually in-browser, flip them to ✅/⚠️/❌, and commit
the update — this file is itself part of the "reduced frontend bugs,
stable user experience" deliverable.
