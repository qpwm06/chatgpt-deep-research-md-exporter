import json
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CONTENT_SCRIPT = ROOT / "content.js"
TARGET_URL = (
    "https://chatgpt.com/g/g-p-6a9b75aa03608191a247260fa120c1ae-impurity/"
    "c/6aa6e282-9290-83e9-a810-87cd1ae29cc1"
)


def long_paragraph(label: str) -> str:
    sentence = f"{label} records the experimental observation and explains the underlying mechanism. "
    return sentence * 18


def export_fixture(page, body: str, url: str = TARGET_URL):
    page.route("**/*", lambda route: route.fulfill(status=200, content_type="text/html", body=body))
    page.add_init_script(
        """
        window.chrome = {
          runtime: {
            onMessage: {
              addListener(listener) {
                window.__exportListener = listener;
              }
            }
          }
        };
        """
    )
    page.add_init_script(f"window.__sourceUrl = {json.dumps(TARGET_URL)}")
    page.goto(url, wait_until="domcontentloaded")
    page.add_script_tag(path=str(CONTENT_SCRIPT))
    response = page.evaluate(
        """
        () => new Promise((resolve) => {
          window.__exportListener(
            { type: 'DEEP_RESEARCH_EXPORT_MARKDOWN', titlePrefix: 'gpt-', sourceUrl: window.__sourceUrl },
            null,
            resolve,
          );
        })
        """
    )
    return json.loads(json.dumps(response))


class ContentExportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.page = self.browser.new_page(viewport={"width": 1440, "height": 1000})

    def tearDown(self):
        self.page.close()

    def test_prefers_open_fullscreen_report_over_conversation(self):
        body = f"""
        <!doctype html><html><body>
          <main>
            <article data-testid="conversation-turn-1">
              <div data-message-author-role="user">SECRET USER PROMPT MUST NOT BE EXPORTED</div>
            </article>
            <article data-testid="conversation-turn-2">
              <div data-message-author-role="assistant"><p>Earlier short answer.</p></div>
            </article>
          </main>
          <div role="dialog" aria-label="Deep research report">
            <button aria-label="Close">Close</button>
            <button aria-expanded="false" onclick="setTimeout(() => {{
              const panel = document.createElement('section');
              panel.innerHTML = `
                <h2>Sources</h2>
                <div>1 <a href='https://example.com/source-one'>Primary source</a></div>
                <div>2 <a href='https://example.org/source-two'>Secondary source</a></div>
              `;
              document.body.appendChild(panel);
            }}, 350)">Sources</button>
            <article data-testid="deep-research-report" class="markdown prose">
              <h1>Impurity Solubility Report</h1>
              <h2>Thermodynamic evidence</h2>
              <p>{long_paragraph('FULLSCREEN REPORT MARKER')}</p>
              <p>Primary evidence <sup data-citation-id="source-1">1</sup>.</p>
              <h2>Crystallization consequences</h2>
              <p>{long_paragraph('CRYSTALLIZATION SECTION')}</p>
              <p>Secondary evidence <sup data-citation-id="source-2">2</sup>.</p>
            </article>
          </div>
        </body></html>
        """

        response = export_fixture(self.page, body)

        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertEqual(result["title"], "gpt-Impurity Solubility Report")
        self.assertIn("FULLSCREEN REPORT MARKER", result["markdown"])
        self.assertNotIn("SECRET USER PROMPT", result["markdown"])
        self.assertEqual(result["sourceCount"], 2)
        self.assertEqual(result["citationCount"], 2, result["markdown"])
        self.assertEqual(result["markdown"].count("# gpt-Impurity Solubility Report"), 1)

    def test_direct_conversation_requires_a_fullscreen_report(self):
        body = f"""
        <!doctype html><html><body>
          <main>
            <article data-testid="conversation-turn-1">
              <div data-message-author-role="user">
                USER QUESTION MUST NOT BE EXPORTED {long_paragraph('question')}
              </div>
            </article>
            <article data-testid="conversation-turn-2">
              <div data-message-author-role="assistant">
                <div class="markdown prose">
                  <h1>Older Deep Research</h1>
                  <h2>Old evidence</h2>
                  <p>{long_paragraph('OLDER REPORT MARKER')}</p>
                  <h2>Old conclusion</h2>
                  <p>{long_paragraph('OLDER CONCLUSION')}</p>
                </div>
              </div>
            </article>
            <article data-testid="conversation-turn-3">
              <div data-message-author-role="assistant">
                <div class="markdown prose">
                  <h1>Final Deep Research</h1>
                  <h2>Evidence base</h2>
                  <p>{long_paragraph('LATEST REPORT MARKER')}</p>
                  <p>Evidence <a href="https://example.net/evidence">1</a>.</p>
                  <h2>Conclusion</h2>
                  <p>{long_paragraph('FINAL CONCLUSION')}</p>
                </div>
              </div>
            </article>
            <form><textarea>Ask anything</textarea></form>
          </main>
        </body></html>
        """

        response = export_fixture(self.page, body)

        self.assertFalse(response["ok"])
        self.assertIn("全屏报告", response["error"])

    def test_selected_fullscreen_writing_block_wins_over_latest_message(self):
        body = f"""
        <!doctype html><html><body>
          <main>
            <div data-message-author-role="assistant">
              <div class="markdown prose">
                <h1>Wrong Latest Report</h1>
                <h2>Latest evidence</h2>
                <p>{long_paragraph('WRONG LATEST REPORT')}</p>
                <h2>Latest conclusion</h2>
                <p>{long_paragraph('WRONG LATEST CONCLUSION')}</p>
              </div>
            </div>
          </main>
          <div class="fixed start-0 end-0 top-0 bottom-0">
            <div
              class="markdown prose"
              data-writing-block-fullscreen-editor-region="true"
              data-writing-block-fullscreen-editor-layout="fullscreen"
            >
              <h1>Selected First Report</h1>
              <h2>Selected evidence</h2>
              <p>{long_paragraph('SELECTED FIRST REPORT')}</p>
              <h2>Selected conclusion</h2>
              <p>{long_paragraph('SELECTED FIRST CONCLUSION')}</p>
              <p>Evidence <a href="https://example.edu/selected">1</a>.</p>
            </div>
          </div>
        </body></html>
        """

        response = export_fixture(self.page, body)

        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertEqual(result["title"], "gpt-Selected First Report")
        self.assertIn("SELECTED FIRST REPORT", result["markdown"])
        self.assertNotIn("WRONG LATEST REPORT", result["markdown"])

    def test_extracts_report_inside_deep_research_content_frame(self):
        body = f"""
        <!doctype html><html><body>
          <button aria-label="Sources and activity" onclick="setTimeout(() => {{
            const panel = document.createElement('section');
            panel.innerHTML = `
              <h2>Sources</h2>
              <div>1 <a href='https://example.gov/research'>Government research</a></div>
            `;
            document.body.appendChild(panel);
          }}, 350)"></button>
          <main>
            <h1>First Conversation Research Report</h1>
            <h2>Executive summary</h2>
            <p>{long_paragraph('IFRAME REPORT MARKER')}</p>
            <h2>Evidence</h2>
            <p>{long_paragraph('IFRAME EVIDENCE')}</p>
            <p>Source <sup data-citation-index="1">1</sup>.</p>
          </main>
        </body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        self.assertEqual(response["result"]["title"], "gpt-First Conversation Research Report")
        self.assertIn("IFRAME REPORT MARKER", response["result"]["markdown"])
        self.assertIn(f'source: "{TARGET_URL}"', response["result"]["markdown"])
        self.assertEqual(response["result"]["sourceCount"], 1)
        self.assertEqual(response["result"]["citationCount"], 1)

    def test_maps_grouped_fullscreen_citations_by_dom_index(self):
        body = f"""
        <!doctype html><html><body>
          <button aria-label="Sources and activity" aria-expanded="false" onclick="setTimeout(() => {{
            const panel = document.createElement('aside');
            panel.innerHTML = `
              <div role='tabpanel'>
                <section aria-labelledby='report-references-citations'>
                  <p id='report-references-citations'>Citations · 2</p>
                  <div role='button' aria-label='Open source 2'>
                    <button data-citation-index='2'>2</button>
                    <a href='https://beta.example/paper'>Beta paper</a>
                    <a href='https://beta.example/paper'>Beta snippet</a>
                  </div>
                  <div role='button' aria-label='Open source 1'>
                    <button data-citation-index='1'>1</button>
                    <a href='https://alpha.example/study'>Alpha study</a>
                  </div>
                </section>
                <section aria-labelledby='report-references-sources-scanned'>
                  <p id='report-references-sources-scanned'>Sources scanned · 1</p>
                  <a href='https://uncited.example/noise'>Uncited source</a>
                </section>
              </div>
            `;
            document.body.appendChild(panel);
          }}, 350)"></button>
          <main>
            <h1>Grouped Citation Report</h1>
            <h2>Evidence</h2>
            <p>{long_paragraph('GROUPED CITATION REPORT')}</p>
            <p>First <sup data-citation-index="1">1</sup>; second <sup data-citation-index="2">2</sup>.</p>
            <h2>Conclusion</h2>
            <p>{long_paragraph('GROUPED CITATION CONCLUSION')}</p>
          </main>
        </body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertEqual(result["sourceCount"], 2)
        self.assertEqual(result["citationCount"], 2, result["markdown"])
        self.assertIn("[1](https://alpha.example/study)", result["markdown"])
        self.assertIn("[2](https://beta.example/paper)", result["markdown"])
        self.assertNotIn("uncited.example", result["markdown"])

    def test_popup_waits_for_explicit_start(self):
        self.page.add_init_script(
            f"""
            window.__exportFrames = [];
            window.__copiedMarkdown = '';
            Object.defineProperty(navigator, 'clipboard', {{
              value: {{ writeText: async (text) => {{ window.__copiedMarkdown = text; }} }},
            }});
            window.chrome = {{
              tabs: {{
                query: async () => [{{ id: 42, url: {json.dumps(TARGET_URL)} }}],
                sendMessage: async (_tabId, _message, options) => {{
                  window.__exportFrames.push(options?.frameId ?? 0);
                  if (options?.frameId !== 7) return {{ ok: false, error: 'Wrong frame' }};
                  return {{
                    ok: true,
                    result: {{
                      title: 'gpt-Selected Fullscreen Report',
                      filename: 'gpt-Selected Fullscreen Report',
                      markdown: String.raw`# gpt-Selected Fullscreen Report

See [source](https://example.com).

\\[
x^2 + y^2
\\]

[ \\Delta G = x^2 ]

[ordinary bracketed text]`,
                      sourceCount: 3,
                      citationCount: 3,
                      warnings: [],
                    }},
                  }};
                }},
              }},
              webNavigation: {{
                getAllFrames: async () => [
                  {{ frameId: 0, parentFrameId: -1, url: {json.dumps(TARGET_URL)} }},
                  {{ frameId: 7, parentFrameId: 0, url: 'https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/' }},
                ],
              }},
              downloads: {{ download: async () => 1 }},
            }};
            """
        )
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.assertEqual(self.page.evaluate("window.__exportFrames.length"), 0)
        self.assertTrue(self.page.locator("#downloadButton").is_disabled())
        self.assertTrue(self.page.locator("#copyButton").is_disabled())
        self.assertTrue(self.page.locator("#latexFixButton").is_disabled())
        self.assertIn("start detection", self.page.locator("#status").inner_text().lower())

        self.page.locator("#startButton").click()
        self.page.wait_for_function("window.__exportFrames.length === 1")
        self.page.wait_for_function("!document.querySelector('#downloadButton').disabled")

        self.assertIn("Page detected", self.page.locator("#status").inner_text())
        self.assertEqual(self.page.evaluate("window.__exportFrames"), [7])
        self.assertFalse(self.page.locator("#copyButton").is_disabled())
        self.assertFalse(self.page.locator("#latexFixButton").is_disabled())

        self.page.locator("#latexFixButton").click()
        self.assertTrue(self.page.locator("#latexFixButton").is_disabled())
        self.page.locator("#copyButton").click()
        self.page.wait_for_function("window.__copiedMarkdown.length > 0")
        copied = self.page.evaluate("window.__copiedMarkdown")
        self.assertIn("$$\nx^2 + y^2\n$$", copied)
        self.assertIn("$$\n\\Delta G = x^2\n$$", copied)
        self.assertNotIn("\\[", copied)
        self.assertIn("[ordinary bracketed text]", copied)
        self.assertIn("[source](https://example.com)", copied)
        fenced = self.page.evaluate(
            "value => fixLatexDisplayDelimiters(value)",
            "```text\n[ \\not_math ]\n```",
        )
        self.assertEqual(fenced["replacementCount"], 0)
        self.assertEqual(fenced["markdown"], "```text\n[ \\not_math ]\n```")
        self.assertEqual(
            self.page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"),
            True,
        )

    def test_manifest_injects_into_deep_research_frames(self):
        manifest = json.loads((ROOT / "manifest.json").read_text())
        content_script = manifest["content_scripts"][0]

        self.assertIn("webNavigation", manifest["permissions"])
        self.assertIn(
            "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/*",
            manifest["host_permissions"],
        )
        self.assertTrue(content_script["all_frames"])
        self.assertTrue(content_script["match_origin_as_fallback"])


if __name__ == "__main__":
    unittest.main()
