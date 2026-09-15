import Foundation
import PDFKit

guard CommandLine.arguments.count == 2 else {
  fputs("Usage: swift scripts/extract-pdf.swift <file.pdf>\n", stderr)
  exit(1)
}
let file = CommandLine.arguments[1]
guard let document = PDFDocument(url: URL(fileURLWithPath: file)) else {
  fputs("Unable to open PDF: \(file)\n", stderr)
  exit(1)
}
for pageIndex in 0..<document.pageCount {
  guard let text = document.page(at: pageIndex)?.string else { continue }
  print("\n<<<PAGE \(pageIndex + 1)>>>\n")
  print(text)
}
