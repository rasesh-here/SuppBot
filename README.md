# SuppBot

A lightweight, zero-dependency AI support chatbot widget that embeds onto any website. SuppBot answers user inquiries by referencing your markdown documentation (RAG) using Groq or OpenAI.

## Features

- **Zero-Dependency Widget**: A single vanilla JS script tag (under 12KB).
- **Simple & Light RAG**: Fast keyword-based matching via TF-IDF without the need for external vector databases.
- **Flexible Data Sources**: Reads local markdown files or syncs live documents directly from HackMD URLs.
- **Provider Agnostic**: Built-in support for Groq and OpenAI.

---

## Setup & Running Locally

1. **Configure Environment Variables**:
   ```bash
   cd backend
   cp .env.example .env
   ```
   Add your `GROQ_API_KEY` or `OPENAI_API_KEY` to the `.env` file.

2. **Install and Start the Server**:
   ```bash
   pnpm install
   pnpm dev
   ```

3. **Verify Installation**:
   Open `http://localhost:3001/test.html` in your browser to try the interactive demo.

---

## Adding Your Documentation

Create a Markdown file in `backend/docs/` named after your product/app (e.g., `cloudnote.md`):

```markdown
# CloudNote FAQ

## Pricing
We offer a Free plan and a Pro plan ($5/month).

## Features
Supports real-time syncing and offline access.
```

Alternatively, to sync live docs, paste a HackMD note URL inside the file:
```text
https://hackmd.io/@username/your-doc-id
```

---

## Embedding the Widget

Add the script tag to any HTML page:

```html
<script
  src="http://localhost:3001/widget.js"
  data-widget-token="pub_cloudnote_secretkey"
  data-title="CloudNote Support"
  data-welcome="Hi! How can I help?"
  data-options="Getting Started,Common Issues,Billing,Contact Support"
  data-primary-color="#2563eb"
  data-secondary-color="#f3f4f6"
  data-position="bottom-right"
  data-offset-x="24px"
  data-offset-y="24px"
  data-api-url="http://localhost:3001"
></script>
```

### Script Options

| Attribute | Description | Default |
|---|---|---|
| `data-widget-token` | API authorization token (must match `ALLOWED_WIDGET_TOKENS` in `.env`) | — |
| `data-title` | Header title of the chat window | `Support Chat` |
| `data-welcome` | Welcome greeting message | `Hi! How can I help you today?` |
| `data-options` | Comma-separated list of quick-reply buttons | `Getting Started,Common Issues,Billing,Contact Support` |
| `data-primary-color` | Accent theme color | `#2563eb` |
| `data-secondary-color` | Chat window background color | `#f3f4f6` |
| `data-position` | Widget placement (`bottom-right`, `bottom-left`, `top-right`, `top-left`) | `bottom-right` |
| `data-offset-x` | X-axis offset from the edge of the viewport | `24px` |
| `data-offset-y` | Y-axis offset from the edge of the viewport | `24px` |
| `data-api-url` | Base URL of your backend server (defaults to script host origin) | — |

### Server Configuration

Authorize widget tokens inside your `backend/.env`:
```env
ALLOWED_WIDGET_TOKENS=pub_cloudnote_secretkey
```
*(Ensure the token format matches `prefix_[productName]_key` where `[productName]` corresponds to the filename in `backend/docs/`).*