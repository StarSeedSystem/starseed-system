import re

main_content = """
  it("guarda y carga un ADN en la Biblioteca", ...
  it("parsea el raw JSON a AdnAvatar", ...
  it("valida el ADN con sanearAdn", ...
  it("rejaza el ADN inválido", ...
  it("devuelve null al cargar un ref que no existe", ...
  it("elimina un ADN de la Biblioteca", ...
"""

rama_content = """
  it("guarda y carga un ADN en la Biblioteca", async () => { ... });
  it("parsea el raw JSON a AdnAvatar", async () => { ... });
  it("valida el ADN con sanearAdn", () => { ... });
  it("rejaza el ADN inválido", () => { ... });
  it("devuelve null al cargar un ref que no existe", async () => { ... });
  it("elimina un ADN de la Biblioteca", async () => { ... });
"""

def extract_it_names(text):
    return set(re.findall(r'it\("(.*?)"', text))

main_tests = extract_it_names(main_content)
rama_tests = extract_it_names(rama_content)

print(f"Main tests: {main_tests}")
print(f"Rama tests: {rama_tests}")
print(f"Subset: {rama_tests.issubset(main_tests)}")
