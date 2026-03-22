import xml.etree.ElementTree as ET

tree = ET.parse('d:\\Kamsis\\temp_docx\\word\\document.xml')
root = tree.getroot()

ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
paragraphs = root.findall('.//w:p', ns)

print("=== STRUKTUR DOKUMEN ===\n")
para_count = 0
for para in paragraphs:
    text_elements = para.findall('.//w:t', ns)
    if text_elements:
        text = ''.join([t.text for t in text_elements if t.text])
        if text.strip():
            para_count += 1
            is_bold = para.find('.//w:b', ns) is not None
            if is_bold:
                print(f"[HEADING] {text[:100]}")
            else:
                print(f"[TEKS] {text[:100]}")
            if para_count >= 60:
                break
