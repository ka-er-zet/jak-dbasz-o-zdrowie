# Prosta aplikacja ankietowa (Pico CSS + minimal JS)

Pliki:
- `index.html` – główny interfejs użytkownika
- `app.js` – prosty renderer ankiety, zapis/wczytywanie do localStorage, eksport wyników
- `pytania.json` – definicja pytań (już w repozytorium)
- `styles.css` – drobne poprawki wyglądu

Jak używać:

1. Otwórz `index.html` w przeglądarce (np. przeciągnij do przeglądarki lub otwórz lokalny serwer). Wczytanie pliku `pytania.json` działa lepiej przez serwer (ze względu na politykę CORS/file://).


2. Wybierz płeć, wypełniaj sekcje, możesz nawigować przyciskami "Dalej"/"Poprzednie".

Uwaga: wersja obecna jest uproszczona — nie posiada opcji zapisu/wczytywania ani eksportu (funkcje te zostały usunięte na życzenie).

Uwagi:
- Aplikacja jest prosta i używa minimalnej ilości JS. Nie ma backendu.
- Jeśli otwierasz plik przez `file://` i przeglądarka blokuje odczyt `pytania.json`, uruchom prosty serwer z Pythona:

```bash
python3 -m http.server
```

Następnie otwórz `http://localhost:8000/index.html`.
