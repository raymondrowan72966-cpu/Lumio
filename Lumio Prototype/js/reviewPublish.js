async function publishForReview(course, btn) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating…';

  const resultEl = document.getElementById('review-result');

  try {
    const res = await fetch('/api/review', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id }),
    });

    const json = await res.json();

    if (!res.ok) {
      const msg = (json && json.error && json.error.message) || 'An error occurred. Please try again.';
      throw new Error(msg);
    }

    const url = json.data.url;

    if (resultEl) {
      resultEl.innerHTML = `
        <div style="background:var(--surface-1,var(--surface-0));border:1px solid var(--teal);border-radius:var(--r-md);padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:600;color:var(--teal);margin-bottom:8px;">✓ Review link created</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" id="review-url-input" value="${escapeHtml(url)}" readonly
              style="flex:1;font-size:12px;font-family:monospace;background:var(--surface-0);border:1px solid var(--border);border-radius:var(--r-sm,4px);padding:6px 10px;color:var(--ink-700);min-width:0;"
              onclick="this.select();" />
            <button class="btn btn-sm" id="review-copy-btn" style="flex-shrink:0;font-size:12px;white-space:nowrap;">Copy Link</button>
          </div>
          <p class="text-sm text-muted" style="margin-top:8px;margin-bottom:0;">Share this link with reviewers. Each publish creates a new frozen snapshot.</p>
        </div>`;

      const copyBtn = document.getElementById('review-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          const input = document.getElementById('review-url-input');
          const reviewUrl = (input && input.value) || url;
          try {
            await navigator.clipboard.writeText(reviewUrl);
          } catch {
            if (input) { input.select(); document.execCommand('copy'); }
          }
          const btn2 = document.getElementById('review-copy-btn');
          if (btn2) {
            btn2.textContent = 'Copied!';
            setTimeout(() => { btn2.textContent = 'Copy Link'; }, 2000);
          }
        });
      }
    }

  } catch (err) {
    if (resultEl) {
      resultEl.innerHTML = `
        <div style="background:var(--pastel-warning,#fff8e1);border:1px solid var(--orange);border-radius:var(--r-md);padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--orange);">
          ⚠ ${escapeHtml((err && err.message) || 'An unexpected error occurred. Please try again.')}
        </div>`;
    }
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
