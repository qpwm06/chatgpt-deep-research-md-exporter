import json
import unittest
from fnmatch import fnmatchcase
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CONTENT_SCRIPT = ROOT / "content.js"
PAGE_BRIDGE = ROOT / "page-bridge.js"
TARGET_URL = (
    "https://chatgpt.com/g/g-p-6a9b75aa03608191a247260fa120c1ae-impurity/"
    "c/6aa6e282-9290-83e9-a810-87cd1ae29cc1"
)
LEGACY_REPORT_FRAME_URL = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/"
APP_SANDBOX_FRAME_URL = (
    "https://mcp-app-0123456789abcdef.web-sandbox.oaiusercontent.com/"
    "?app=skybridge&locale=en-US&deviceType=desktop"
)
APP_SANDBOX_FRAMES_WITH_CHATGPT_SUBFRAME = [
    {"frameId": 0, "parentFrameId": -1, "url": TARGET_URL},
    {"frameId": 3, "parentFrameId": 0, "url": "https://chatgpt.com/embedded-widget"},
    {"frameId": 7, "parentFrameId": 0, "url": APP_SANDBOX_FRAME_URL},
]
# 真实对话的结构：每份报告位于 mcp-app 沙箱内嵌的 about:blank frame，frameId 不按对话顺序分配。
MULTI_REPORT_FRAMES = [
    {"frameId": 0, "parentFrameId": -1, "url": TARGET_URL},
    {"frameId": 7, "parentFrameId": 0, "url": APP_SANDBOX_FRAME_URL},
    {"frameId": 8, "parentFrameId": 0, "url": APP_SANDBOX_FRAME_URL},
    {"frameId": 9, "parentFrameId": 0, "url": APP_SANDBOX_FRAME_URL},
    {"frameId": 10, "parentFrameId": 8, "url": "about:blank"},
    {"frameId": 11, "parentFrameId": 7, "url": "about:blank"},
    {"frameId": 12, "parentFrameId": 9, "url": "about:blank"},
]
INLINE_REPORT = {"ok": True, "hasReport": True, "displayMode": "inline"}
FULLSCREEN_REPORT = {"ok": True, "hasReport": True, "displayMode": "fullscreen"}


def long_paragraph(label: str) -> str:
    sentence = f"{label} records the experimental observation and explains the underlying mechanism. "
    return sentence * 18


def export_fixture(page, body: str, url: str = TARGET_URL):
    page.route(
        "**/*",
        lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=body),
    )
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


FRAME_REPORT = f"""
<!doctype html><html><body><main>
  <h1>Frame Report</h1>
  <h2>Evidence</h2>
  <p>{long_paragraph('FRAME REPORT EVIDENCE')}</p>
  <h2>Conclusion</h2>
  <p>{long_paragraph('FRAME REPORT CONCLUSION')}</p>
</main></body></html>
"""


def describe_report(page, body: str, init_script: str):
    page.route(
        "**/*",
        lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=body),
    )
    page.route("**/page-bridge.js", lambda route: route.fulfill(path=str(PAGE_BRIDGE)))
    page.add_init_script(
        """
        window.chrome = {
          runtime: {
            getURL: (path) => `https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/${path}`,
            onMessage: { addListener(listener) { window.__exportListener = listener; } },
          },
        };
        """
    )
    page.add_init_script(init_script)
    page.goto(LEGACY_REPORT_FRAME_URL, wait_until="domcontentloaded")
    page.add_script_tag(path=str(CONTENT_SCRIPT))
    return page.evaluate(
        """
        () => new Promise((resolve) => {
          setTimeout(() => resolve(null), 3000);
          window.__exportListener({ type: 'DEEP_RESEARCH_DESCRIBE_REPORT' }, null, resolve);
        })
        """
    )


def install_extension_api(page, frames, reports, firefox=False, report_states=None):
    page.add_init_script(
        f"""
        window.__exportFrames = [];
        window.__sourceOpenFrames = [];
        window.__downloads = [];
        const reportStates = {json.dumps({str(frame_id): state for frame_id, state in (report_states or {}).items()})};
        const tabs = [{{ id: 42, url: {json.dumps(TARGET_URL)}, title: 'Research report' }}];
        const frames = {json.dumps(frames)};
        const reports = {json.dumps({str(frame_id): title for frame_id, title in reports.items()})};
        const respond = (message, options) => {{
          const frameId = options?.frameId ?? 0;
          if (message?.type === 'DEEP_RESEARCH_DESCRIBE_REPORT') {{
            return reportStates[String(frameId)] ?? {{ ok: true, hasReport: false, displayMode: '' }};
          }}
          if (message?.type === 'DEEP_RESEARCH_OPEN_SOURCES') {{
            window.__sourceOpenFrames.push(frameId);
            return {{ ok: true, openedSources: false }};
          }}
          if (message?.type !== 'DEEP_RESEARCH_EXPORT_MARKDOWN') return {{ ok: false }};
          window.__exportFrames.push(frameId);
          const title = reports[String(frameId)];
          if (!title) return {{ ok: false, error: 'No report in frame' }};
          return {{
            ok: true,
            result: {{ title, filename: title, markdown: `# ${{title}}\\n`, sourceCount: 1, citationCount: 1, warnings: [] }},
          }};
        }};
        window.chrome = {{
          tabs: {{
            query: async () => tabs,
            sendMessage: async (_tabId, message, options) => respond(message, options),
          }},
          webNavigation: {{ getAllFrames: async () => frames }},
          downloads: {{
            download: async (options) => {{
              window.__downloads.push({{ filename: options.filename, saveAs: options.saveAs }});
              return 1;
            }},
          }},
        }};
        if ({json.dumps(firefox)}) {{
          window.browser = {{
            ...window.chrome,
            runtime: {{ getBrowserInfo: async () => ({{ name: 'Firefox', vendor: 'Mozilla', version: '156.0' }}) }},
          }};
        }}
        """
    )


def match_pattern_covers(pattern: str, url: str) -> bool:
    scheme, _, rest = pattern.partition("://")
    host_pattern, _, path_pattern = rest.partition("/")
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if host_pattern.startswith("*."):
        host_matches = host == host_pattern[2:] or host.endswith(host_pattern[1:])
    else:
        host_matches = host_pattern in ("*", host)
    path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    return scheme in ("*", parsed.scheme) and host_matches and fnmatchcase(path, f"/{path_pattern}")


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

    def test_expands_one_fullscreen_citation_into_multiple_source_links(self):
        body = f"""
        <!doctype html><html><body>
          <button aria-label="Sources and activity" aria-expanded="false" onclick="setTimeout(() => {{
            const panel = document.createElement('aside');
            panel.innerHTML = `
              <div role='tabpanel'>
                <section aria-labelledby='report-references-citations'>
                  <p id='report-references-citations'>Citations · 2</p>
                  <div role='button' aria-label='Open citation 1'>
                    <button data-citation-index='1'>1</button>
                    <a href='https://alpha.example/study'>Alpha study</a>
                    <a href='https://beta.example/paper'>Beta paper</a>
                  </div>
                  <div role='button' aria-label='Open citation 2'>
                    <button data-citation-index='2'>2</button>
                    <a href='https://gamma.example/result'>Gamma result</a>
                  </div>
                </section>
              </div>
            `;
            document.body.appendChild(panel);
          }}, 350)"></button>
          <main>
            <h1>Merged Citation Report</h1>
            <h2>Evidence</h2>
            <p>{long_paragraph('MERGED CITATION REPORT')}</p>
            <p>Merged evidence <sup data-citation-index="1">1</sup>.</p>
            <h2>Conclusion</h2>
            <p>{long_paragraph('MERGED CITATION CONCLUSION')}</p>
            <p>Other evidence <sup data-citation-index="2">2</sup>.</p>
          </main>
        </body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertEqual(result["sourceCount"], 3)
        self.assertEqual(result["citationCount"], 3, result["markdown"])
        self.assertIn(
            "Merged evidence [1](https://alpha.example/study)[2](https://beta.example/paper).",
            result["markdown"],
        )
        self.assertIn("Other evidence [3](https://gamma.example/result).", result["markdown"])

    def test_renders_every_citation_inside_a_numeric_span_group(self):
        body = f"""
        <!doctype html><html><body>
          <button aria-label="Sources and activity" aria-expanded="false" onclick="setTimeout(() => {{
            const panel = document.createElement('aside');
            panel.innerHTML = `
              <div role='tabpanel'>
                <section aria-labelledby='report-references-citations'>
                  <p id='report-references-citations'>Citations · 2</p>
                  <div><button data-citation-index='1'>1</button><a href='https://alpha.example/study'>Alpha</a></div>
                  <div><button data-citation-index='2'>2</button><a href='https://beta.example/paper'>Beta</a></div>
                </section>
              </div>
            `;
            document.body.appendChild(panel);
          }}, 350)"></button>
          <main>
            <h1>Grouped Superscript Report</h1>
            <h2>Evidence</h2>
            <p>{long_paragraph('GROUPED SUPERSCRIPT REPORT')}</p>
            <p>Combined evidence <span class="citation-group"><sup data-citation-index="1">1</sup><sup data-citation-index="2">2</sup></span>.</p>
            <p>Linked group <a href="#citations"><sup data-citation-index="1">1</sup><sup data-citation-index="2">2</sup></a>.</p>
            <h2>Conclusion</h2>
            <p>{long_paragraph('GROUPED SUPERSCRIPT CONCLUSION')}</p>
          </main>
        </body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertEqual(result["citationCount"], 4, result["markdown"])
        self.assertIn(
            "Combined evidence [1](https://alpha.example/study)[2](https://beta.example/paper).",
            result["markdown"],
        )
        self.assertIn(
            "Linked group [1](https://alpha.example/study)[2](https://beta.example/paper).",
            result["markdown"],
        )

    def test_collects_every_url_from_a_citation_carousel(self):
        body = f"""
        <!doctype html><html><body>
          <script>
            const carouselSources = [
              ['Alpha carousel source', 'https://alpha.example/carousel'],
              ['Beta carousel source', 'https://beta.example/carousel'],
            ];
            let carouselIndex = 0;
            function renderCarousel() {{
              let popover = document.getElementById('citation-popover');
              if (!popover) {{
                popover = document.createElement('div');
                popover.id = 'citation-popover';
                popover.style = 'position: fixed; left: 300px; top: 200px; width: 420px; height: 180px; background: white;';
                popover.innerHTML = `
                  <button onclick='carouselIndex = (carouselIndex + 1) % 2; renderCarousel()'><svg width='20' height='20'><path d='m15 18-6-6 6-6'></path></svg></button>
                  <button onclick='window.__carouselOpacityWhenAdvanced = getComputedStyle(this.parentElement).opacity; carouselIndex = (carouselIndex + 1) % 2; renderCarousel()'><svg width='20' height='20'><path d='m9 18 6-6-6-6'></path></svg></button>
                  <a id='carousel-link'></a>
                  <button aria-label='Open source' onclick='window.__openedSource = true'>↗</button>
                `;
                document.body.appendChild(popover);
              }}
              const link = popover.querySelector('#carousel-link');
              link.textContent = carouselSources[carouselIndex][0];
              link.href = carouselSources[carouselIndex][1];
            }}
          </script>
          <aside style="position: fixed; right: 0; top: 0; width: 280px; background: white;">
            <div role="tabpanel">
              <section aria-labelledby="report-references-citations">
                <p id="report-references-citations">Citations · 2</p>
                <div class="domain-group">
                  <a href="https://alpha.example/carousel">Grouped domain link</a>
                  <button aria-label="Previous item">←</button>
                  <button aria-label="Next item">→</button>
                  <div><button data-citation-index="1">1</button><a href="https://alpha.example/carousel">Alpha source</a></div>
                  <div><button data-citation-index="2">2</button><a href="https://beta.example/carousel">Beta source</a></div>
                </div>
              </section>
            </div>
          </aside>
          <div id="stale-source-card" style="position: fixed; left: 0; top: 0; width: 180px; height: 80px; background: white;">
            <a href="https://link.springer.com/">Springer</a>
            <button aria-label="Previous source">←</button>
            <button aria-label="Next source">→</button>
          </div>
          <main>
            <h1>Citation Carousel Report</h1>
            <h2>Evidence</h2>
            <p>{long_paragraph('CITATION CAROUSEL REPORT')}</p>
            <p>Carousel evidence <a href="https://link.springer.com/"><sup data-citation-index="1" onclick="renderCarousel()">1</sup></a>.</p>
            <h2>Conclusion</h2>
            <p>{long_paragraph('CITATION CAROUSEL CONCLUSION')}</p>
          </main>
        </body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertEqual(result["sourceCount"], 2, result["markdown"])
        self.assertEqual(result["citationCount"], 2, result["markdown"])
        self.assertFalse(self.page.evaluate("Boolean(window.__openedSource)"))
        self.assertEqual(self.page.evaluate("window.__carouselOpacityWhenAdvanced"), "0")
        self.assertNotIn("link.springer.com", result["markdown"])
        self.assertIn(
            "Carousel evidence [1](https://alpha.example/carousel)[2](https://beta.example/carousel).",
            result["markdown"],
        )

    def test_waits_for_reused_citation_carousel_to_update_all_urls(self):
        body = f"""
        <!doctype html><html><body>
          <script>
            const carouselSources = [
              ['Source one', 'https://alpha.example/one'],
              ['Source fifteen', 'https://alpha.example/fifteen'],
              ['Source eighteen', 'https://alpha.example/eighteen'],
            ];
            let carouselIndex = 0;
            function renderCarousel() {{
              const link = document.querySelector('#citation-popover a');
              link.textContent = carouselSources[carouselIndex][0];
              link.href = carouselSources[carouselIndex][1];
            }}
            function openCitationCarousel() {{
              window.setTimeout(() => {{
                carouselIndex = 0;
                renderCarousel();
              }}, 350);
            }}
            function showNextSource() {{
              window.setTimeout(() => {{
                carouselIndex = (carouselIndex + 1) % carouselSources.length;
                renderCarousel();
              }}, 350);
            }}
          </script>
          <div id="citation-popover" style="position: fixed; left: 300px; top: 200px; width: 420px; height: 180px; background: white;">
            <button aria-label="Previous source">←</button>
            <button aria-label="Next source" onclick="showNextSource()">→</button>
            <a href="https://link.springer.com/">Unrelated stale card</a>
          </div>
          <aside style="position: fixed; right: 0; top: 0; width: 280px; background: white;">
            <div role="tabpanel">
              <section aria-labelledby="report-references-citations">
                <p id="report-references-citations">Citations · 3</p>
                <div><button data-citation-index="1">1</button><a href="https://alpha.example/one">Source one</a></div>
                <div><button data-citation-index="15">15</button><a href="https://alpha.example/fifteen">Source fifteen</a></div>
                <div><button data-citation-index="18">18</button><a href="https://alpha.example/eighteen">Source eighteen</a></div>
              </section>
            </div>
          </aside>
          <main>
            <h1>Delayed Carousel Report</h1>
            <h2>Evidence</h2>
            <p>{long_paragraph('DELAYED CAROUSEL REPORT')}</p>
            <p>Grouped evidence <sup data-citation-index="1" onclick="openCitationCarousel()">1</sup>.</p>
            <h2>Conclusion</h2>
            <p>{long_paragraph('DELAYED CAROUSEL CONCLUSION')}</p>
          </main>
        </body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertNotIn("link.springer.com", result["markdown"])
        self.assertIn(
            "Grouped evidence "
            "[1](https://alpha.example/one)"
            "[2](https://alpha.example/fifteen)"
            "[3](https://alpha.example/eighteen).",
            result["markdown"],
        )

    def test_matches_only_the_cards_present_in_each_linkless_citation_tooltip(self):
        body = f"""
        <!doctype html><html><body>
          <script>
            const citationCards = {{
              1: [
                ['arxiv.org', 'Solubility prediction of organic molecules with molecular dynamics simulations'],
                ['acs.figshare.com', 'Rational Solvent Selection for Pharmaceutical Impurity Purge'],
              ],
              2: [
                ['researchgate.net', 'A single-source solubility study'],
              ],
            }};
            let activeCitation = 0;
            let activeCard = 0;

            function renderLinklessTooltip() {{
              let tooltip = document.getElementById('citation-tooltip');
              if (!tooltip) {{
                tooltip = document.createElement('div');
                tooltip.id = 'citation-tooltip';
                tooltip.setAttribute('role', 'tooltip');
                tooltip.setAttribute('data-state', 'open');
                tooltip.style = 'position: fixed; left: 300px; top: 200px; width: 344px; height: 159px; background: white;';
                document.body.appendChild(tooltip);
              }}
              const card = citationCards[activeCitation][activeCard];
              const controls = citationCards[activeCitation].length > 1
                ? `<button aria-label='←'>←</button><button aria-label='→' onclick='showNextLinklessCard()'>→</button>`
                : '';
              tooltip.innerHTML = `${{controls}}<div class='card-domain'></div><div class='card-title'></div>`;
              tooltip.querySelector('.card-domain').textContent = card[0];
              tooltip.querySelector('.card-title').textContent = card[1];
            }}

            function openLinklessCitation(index) {{
              activeCitation = index;
              activeCard = 0;
              renderLinklessTooltip();
            }}

            function showNextLinklessCard() {{
              const cards = citationCards[activeCitation];
              activeCard = (activeCard + 1) % cards.length;
              renderLinklessTooltip();
            }}
          </script>
          <aside style="position: fixed; right: 0; top: 0; width: 360px; background: white;">
            <div role="tabpanel">
              <section aria-labelledby="linkless-citations">
                <p id="linkless-citations">Citations · 4</p>
                <div>
                  <a href="https://arxiv.org/abs/2104.10792">arxiv.org</a>
                  <div><button data-citation-index="1">1</button><a href="https://arxiv.org/abs/2104.10792">Solubility prediction of organic molecules with molecular dynamics simulations</a></div>
                  <div><button data-citation-index="18">18</button><a href="https://arxiv.org/abs/2407.03434">Predicting another property from molecular structure</a></div>
                </div>
                <div><button data-citation-index="15">15</button><a href="https://acs.figshare.com/collections/Rational_Solvent_Selection_for_Pharmaceutical_Impurity_Purge/3984081">Rational Solvent Selection for Pharmaceutical Impurity Purge</a></div>
                <div><button data-citation-index="2">2</button><a href="https://www.researchgate.net/publication/12345_A_single-source_solubility_study">A single-source solubility study</a></div>
              </section>
            </div>
          </aside>
          <main>
            <h1>Mixed Citation Tooltip Report</h1>
            <h2>Evidence</h2>
            <p>{long_paragraph('MIXED CITATION TOOLTIP REPORT')}</p>
            <p>Multiple sources <sup role="button" tabindex="0" data-citation-index="1" onclick="openLinklessCitation(1)">1</sup>.</p>
            <p>Single source <sup role="button" tabindex="0" data-citation-index="2" onclick="openLinklessCitation(2)">2</sup>.</p>
            <h2>Conclusion</h2>
            <p>{long_paragraph('MIXED CITATION TOOLTIP CONCLUSION')}</p>
          </main>
        </body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        started_at = self.page.evaluate("Date.now()")
        response = export_fixture(self.page, body, frame_url)
        elapsed_ms = self.page.evaluate("Date.now()") - started_at

        self.assertTrue(response["ok"])
        markdown = response["result"]["markdown"]
        self.assertIn(
            "Multiple sources "
            "[1](https://arxiv.org/abs/2104.10792)"
            "[2](https://acs.figshare.com/collections/Rational_Solvent_Selection_for_Pharmaceutical_Impurity_Purge/3984081).",
            markdown,
        )
        self.assertIn(
            "Single source "
            "[3](https://www.researchgate.net/publication/12345_A_single-source_solubility_study).",
            markdown,
        )
        self.assertNotIn(
            "Single source [3](https://www.researchgate.net/publication/12345_A_single-source_solubility_study)[",
            markdown,
        )
        self.assertLess(elapsed_ms, 4000)

    def test_preserves_citation_urls_inside_tables(self):
        body = f"""
        <!doctype html><html><body>
          <aside><div role="tabpanel"><section aria-labelledby="table-citations">
            <p id="table-citations">Citations · 2</p>
            <div><button data-citation-index="1">1</button><a href="https://alpha.example/table">Alpha table source</a></div>
            <div><button data-citation-index="2">2</button><a href="https://beta.example/table">Beta table source</a></div>
          </section></div></aside>
          <main>
            <h1>Table Citation Report</h1>
            <h2>Evidence</h2>
            <p>{long_paragraph('TABLE CITATION REPORT')}</p>
            <table>
              <thead><tr><th>Study</th><th>Evidence</th></tr></thead>
              <tbody>
                <tr><td>Alpha</td><td>First result <sup data-citation-index="1">1</sup></td></tr>
                <tr><td>Beta</td><td>Second result <sup data-citation-index="2">2</sup></td></tr>
              </tbody>
            </table>
            <h2>Conclusion</h2>
            <p>{long_paragraph('TABLE CITATION CONCLUSION')}</p>
          </main>
        </body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        markdown = response["result"]["markdown"]
        self.assertIn("First result [1](https://alpha.example/table)", markdown)
        self.assertIn("Second result [2](https://beta.example/table)", markdown)

    def test_renumbers_distinct_urls_that_chatgpt_labels_as_one(self):
        body = f"""
        <!doctype html><html><body><main>
          <h1>Repeated Label Report</h1>
          <h2>Evidence</h2>
          <p>{long_paragraph('REPEATED LABEL REPORT')}</p>
          <p>Sources <a href="https://alpha.example/repeated">[1]</a><a href="https://beta.example/repeated">[1]</a>.</p>
          <h2>Conclusion</h2>
          <p>{long_paragraph('REPEATED LABEL CONCLUSION')}</p>
        </main></body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        result = response["result"]
        self.assertIn(
            "Sources [1](https://alpha.example/repeated)[2](https://beta.example/repeated).",
            result["markdown"],
        )

    def test_clicks_show_code_before_exporting_mermaid(self):
        body = f"""
        <!doctype html><html><body>
        <script>
          function showMermaidCode(control) {{
            const rendered = control.closest('pre');
            const widget = control.closest('.mermaid-widget');
            setTimeout(() => {{
              rendered.remove();
              const sourcePre = document.createElement('pre');
              const code = document.createElement('code');
              code.className = 'language-meriad';
              code.textContent = 'flowchart TD\\nA[Raw node] --> B{{Result}}';
              sourcePre.appendChild(code);
              widget.appendChild(sourcePre);
            }}, 80);
          }}
          function resetMermaid() {{
            const template = document.getElementById('rendered-mermaid-template');
            document.querySelector('.mermaid-widget').replaceChildren(template.content.cloneNode(true));
          }}
        </script>
        <template id="rendered-mermaid-template"><pre><style>#mermaid-rendered {{ color: red; }}</style><svg><text>RENDERED MERMAID LABEL MUST NOT BE EXPORTED</text></svg><p class="show-code" style="opacity: 0" onclick="showMermaidCode(this)">显示代码</p></pre></template>
        <aside><div role="tabpanel"><section aria-labelledby="mermaid-citations"><p id="mermaid-citations">Citations · 1</p><div><button data-citation-index="1">1</button><a href="https://alpha.example/mermaid">Mermaid source</a></div></section></div></aside>
        <main>
          <h1>Mermaid Report</h1>
          <h2>Evidence</h2>
          <p>{long_paragraph('MERMAID REPORT')}</p>
          <div class="mermaid-widget">
            <pre><style>#mermaid-rendered {{ color: red; }}</style><svg><text>RENDERED MERMAID LABEL MUST NOT BE EXPORTED</text></svg><p class="show-code" style="opacity: 0" onclick="showMermaidCode(this)">显示代码</p></pre>
          </div>
          <p>Diagram evidence <sup data-citation-index="1" onclick="resetMermaid()">1</sup>.</p>
          <h2>Conclusion</h2>
          <p>{long_paragraph('MERMAID CONCLUSION')}</p>
        </main></body></html>
        """
        frame_url = "https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/report"

        response = export_fixture(self.page, body, frame_url)

        self.assertTrue(response["ok"])
        markdown = response["result"]["markdown"]
        self.assertIn("```mermaid\nflowchart TD", markdown)
        self.assertIn('A["Raw node"] --> B{"Result"}', markdown)
        self.assertNotIn("```meriad", markdown)
        self.assertNotIn("#mermaid-rendered", markdown)
        self.assertNotIn("RENDERED MERMAID LABEL", markdown)

    def test_popup_waits_for_explicit_start(self):
        self.page.add_init_script(
            f"""
            window.__exportFrames = [];
            window.__sourceOpenFrames = [];
            window.__copiedMarkdown = '';
            Object.defineProperty(navigator, 'clipboard', {{
              value: {{ writeText: async (text) => {{ window.__copiedMarkdown = text; }} }},
            }});
            window.chrome = {{
              tabs: {{
                query: async () => [{{ id: 42, url: {json.dumps(TARGET_URL)} }}],
                sendMessage: async (_tabId, message, options) => {{
                  if (message?.type === 'DEEP_RESEARCH_DESCRIBE_REPORT') return {{ ok: true, hasReport: false, displayMode: '' }};
                  if (message?.type === 'DEEP_RESEARCH_OPEN_SOURCES') {{
                    window.__sourceOpenFrames.push(options?.frameId ?? 0);
                    return {{ ok: true, openedSources: options?.frameId === 7 }};
                  }}
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
        self.assertEqual(self.page.evaluate("window.__sourceOpenFrames"), [7, 0])
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

    def test_popup_exports_from_app_sandbox_report_frame_first(self):
        install_extension_api(
            self.page,
            APP_SANDBOX_FRAMES_WITH_CHATGPT_SUBFRAME,
            {3: "gpt-Embedded ChatGPT Frame", 7: "gpt-App Sandbox Report"},
        )
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.page.locator("#startButton").click()
        self.page.wait_for_function("!document.querySelector('#startButton').disabled")

        self.assertIn("gpt-App Sandbox Report", self.page.locator("#summary").inner_text())
        self.assertEqual(self.page.evaluate("window.__exportFrames"), [7])

    def test_popup_exports_only_the_fullscreen_report(self):
        install_extension_api(
            self.page,
            MULTI_REPORT_FRAMES,
            {11: "gpt-First Report", 12: "gpt-Opened Report"},
            report_states={11: INLINE_REPORT, 12: FULLSCREEN_REPORT},
        )
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.page.locator("#startButton").click()
        self.page.wait_for_function("!document.querySelector('#downloadButton').disabled")

        self.assertIn("gpt-Opened Report", self.page.locator("#summary").inner_text())
        self.assertEqual(self.page.evaluate("window.__exportFrames"), [12])

    def test_popup_leaves_other_reports_sources_closed(self):
        install_extension_api(
            self.page,
            MULTI_REPORT_FRAMES,
            {11: "gpt-First Report", 12: "gpt-Opened Report"},
            report_states={11: INLINE_REPORT, 12: FULLSCREEN_REPORT},
        )
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.page.locator("#startButton").click()
        self.page.wait_for_function("!document.querySelector('#downloadButton').disabled")

        self.assertEqual(self.page.evaluate("window.__sourceOpenFrames"), [12])

    def test_popup_asks_to_open_a_report_when_several_are_inline(self):
        install_extension_api(
            self.page,
            MULTI_REPORT_FRAMES,
            {11: "gpt-First Report", 12: "gpt-Second Report"},
            report_states={11: INLINE_REPORT, 12: INLINE_REPORT},
        )
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.page.locator("#startButton").click()
        self.page.wait_for_function("document.querySelector('#status').textContent.includes('several reports')")
        self.page.wait_for_function("!document.querySelector('#startButton').disabled")

        self.assertEqual(self.page.evaluate("window.__exportFrames"), [])
        self.assertEqual(self.page.evaluate("window.__sourceOpenFrames"), [])
        self.assertTrue(self.page.locator("#downloadButton").is_disabled())

    def test_popup_exports_a_lone_inline_report(self):
        install_extension_api(
            self.page,
            MULTI_REPORT_FRAMES,
            {11: "gpt-Only Report"},
            report_states={11: INLINE_REPORT},
        )
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.page.locator("#startButton").click()
        self.page.wait_for_function("!document.querySelector('#downloadButton').disabled")

        self.assertIn("gpt-Only Report", self.page.locator("#summary").inner_text())

    def test_popup_asks_to_stay_open_while_detecting(self):
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.assertIn("keep this popup open", self.page.evaluate("MESSAGES.en.status_checking"))
        self.assertIn("保持此弹窗打开", self.page.evaluate("MESSAGES['zh-CN'].status_checking"))

    def test_describes_report_display_mode_through_page_bridge(self):
        state = describe_report(self.page, FRAME_REPORT, "window.openai = { displayMode: 'fullscreen' };")

        self.assertEqual(state, FULLSCREEN_REPORT)

    def test_describes_report_display_mode_through_firefox_xray(self):
        state = describe_report(
            self.page,
            FRAME_REPORT,
            "window.wrappedJSObject = { openai: { displayMode: 'inline' } };",
        )

        self.assertEqual(state, INLINE_REPORT)

    def test_describes_stopped_research_as_having_no_report(self):
        state = describe_report(
            self.page,
            "<!doctype html><html><body><main><div>Research stopped</div></main></body></html>",
            "window.openai = { displayMode: 'inline' };",
        )

        self.assertFalse(state["hasReport"])

    def test_popup_download_skips_save_dialog_in_firefox(self):
        install_extension_api(self.page, APP_SANDBOX_FRAMES_WITH_CHATGPT_SUBFRAME, {7: "gpt-Firefox Report"}, firefox=True)
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.page.locator("#startButton").click()
        self.page.wait_for_function("!document.querySelector('#downloadButton').disabled")
        self.page.locator("#downloadButton").click()
        self.page.wait_for_function("window.__downloads.length === 1")

        self.assertEqual(
            self.page.evaluate("window.__downloads"),
            [{"filename": "gpt-Firefox Report.md", "saveAs": False}],
        )

    def test_popup_download_keeps_save_dialog_in_chrome(self):
        install_extension_api(self.page, APP_SANDBOX_FRAMES_WITH_CHATGPT_SUBFRAME, {7: "gpt-Chrome Report"})
        self.page.goto((ROOT / "popup.html").as_uri(), wait_until="domcontentloaded")

        self.page.locator("#startButton").click()
        self.page.wait_for_function("!document.querySelector('#downloadButton').disabled")
        self.page.locator("#downloadButton").click()
        self.page.wait_for_function("window.__downloads.length === 1")

        self.assertEqual(
            self.page.evaluate("window.__downloads"),
            [{"filename": "gpt-Chrome Report.md", "saveAs": True}],
        )

    def test_diagnostic_exports_from_app_sandbox_report_frame_first(self):
        install_extension_api(
            self.page,
            APP_SANDBOX_FRAMES_WITH_CHATGPT_SUBFRAME,
            {3: "gpt-Embedded ChatGPT Frame", 7: "gpt-App Sandbox Report"},
        )
        self.page.goto((ROOT / "diagnostic.html").as_uri(), wait_until="domcontentloaded")

        self.page.wait_for_function("document.querySelector('#status').textContent === 'Diagnostic downloaded'")

        self.assertEqual(
            self.page.evaluate("window.__downloads"),
            [{"filename": "chatgpt-exporter-diagnostic.json", "saveAs": False}],
        )
        self.assertEqual(self.page.evaluate("window.__exportFrames"), [7])

    def test_manifest_injects_into_deep_research_frames(self):
        manifest = json.loads((ROOT / "manifest.json").read_text())
        content_script = manifest["content_scripts"][0]
        pattern_lists = {
            "host_permissions": manifest["host_permissions"],
            "content_scripts": content_script["matches"],
            "web_accessible_resources": manifest["web_accessible_resources"][0]["matches"],
        }

        self.assertIn("webNavigation", manifest["permissions"])
        self.assertTrue(content_script["all_frames"])
        self.assertTrue(content_script["match_origin_as_fallback"])
        for name, patterns in pattern_lists.items():
            for url in (LEGACY_REPORT_FRAME_URL, APP_SANDBOX_FRAME_URL):
                with self.subTest(patterns=name, url=url):
                    self.assertTrue(any(match_pattern_covers(pattern, url) for pattern in patterns))
            with self.subTest(patterns=name, url="files.oaiusercontent.com"):
                self.assertFalse(any(
                    match_pattern_covers(pattern, "https://files.oaiusercontent.com/file-abc")
                    for pattern in patterns
                ))


if __name__ == "__main__":
    unittest.main()
