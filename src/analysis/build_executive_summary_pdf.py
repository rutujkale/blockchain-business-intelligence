import subprocess
import sys
from pathlib import Path

import typst
from pypdf import PdfReader

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PANDOC = Path(r"C:\Users\Asus\AppData\Local\Pandoc\pandoc.exe")
REPORTS = PROJECT_ROOT / "outputs" / "reports"
MD = REPORTS / "executive_summary.md"
TYP = REPORTS / "executive_summary.typ"
PDF = REPORTS / "executive_summary.pdf"

PRELUDE = """#set page(paper: \"a4\", margin: 1.2cm)
#set text(size: 9pt)
#set par(leading: 0.85em)
#show heading: it => block(above: 0.4em, below: 0.25em, it)
"""


def main() -> None:
    subprocess.run(
        [str(PANDOC), str(MD), "-t", "typst", "-o", str(TYP)],
        check=True,
        capture_output=True,
    )
    body = TYP.read_text(encoding="utf-8")
    TYP.write_text(PRELUDE + body, encoding="utf-8")
    typst.compile(str(TYP), str(PDF))
    pages = len(PdfReader(str(PDF)).pages)
    print(f"executive_summary.pdf: {pages} page(s), {PDF.stat().st_size} bytes")
    sys.exit(0 if pages == 1 else 1)


if __name__ == "__main__":
    main()