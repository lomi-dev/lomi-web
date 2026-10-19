# Kierunek wizualny Lomi

Analiza i redesign: 19 października 2026. Strony obejrzano w przeglądarce przy
1440 × 1000, odczytano ich treść i sprawdzono wybrane interakcje. Opis dotyczy
wersji dostępnych tego dnia. Szczególnie Warp zmienił pozycjonowanie względem
dawniejszej strony terminala. Wnioski opisują kompozycję i zachowanie interfejsu;
nie przypisują im wyników sprzedażowych ani konwersji.

## Co nie działało w pierwszym szkicu

Pierwsza wersja miała poprawną hierarchię, ale jej szkielet pasował do wielu
produktów: wyśrodkowane hasło, ozdobny kursywny drugi wiersz, dwa przyciski,
zrzut aplikacji, trzy kroki i sześć podobnych elementów funkcji. Kolejne sekcje
miały podobną szerokość, oddech i sposób rozpoczęcia. Przewijanie przynosiło
nowe nagłówki, ale niewiele nowych form prezentacji.

Także język był wymienny. Hasła o przestrzeni do tworzenia, możliwościach
i poczuciu bycia u siebie opisywały nastrój. Nie wyjaśniały, co użytkownik
zrobi z terminalem, edytorem i przeglądarką. Technologicznego charakteru nie
dało się uzyskać samym zastąpieniem jasnego tła ciemnym.

## Sześć stron referencyjnych

### OpenBot

[Strona źródłowa](https://openbot.run/)

Hero jest centralne: duża typografia, znak produktu w nagłówku, krótki opis
i pobranie. Ciemne tło z regularną siatką oraz fioletowy znak tworzą rozpoznawalny
system, ale sam układ pozostaje znajomy. Odrębność pojawia się w demonstracji
aplikacji i przykładach wymiany zadań między agentami.

Ważniejszy od samej siatki jest poziom konkretu. Czytelnik widzi rozmowę, zmianę
prowadzącego zadanie i działanie przeglądarki. Poszczególne funkcje mają własny
materiał wizualny. Późniejsze sekcje odpowiadają na praktyczne pytania o koszt,
lokalne dane i dostępność platform. To analiza prezentacji OpenBot, a nie
przeniesienie jego funkcji do Lomi.

W Lomi wykorzystano zasadę demonstracji: podgląd można przełączyć między
budowaniem, przeglądarką i zmianami Git. Każdy wariant pochodzi z rzeczywistej
aplikacji. Lomi zachowuje własną paletę i motyw chmur.

### T3 Code

[Strona źródłowa](https://t3.codes/)

Otwierająca kompozycja jest symetryczna. Duży nagłówek otaczają przestrzenne
symbole narzędzi, a poniżej znajduje się ciemny produkt. Dyskretna siatka
wiąże całość. Zmiana skali między logotypami, tekstem i ekranem daje poczucie
głębi. Nawigacja jest bardzo krótka.

Własny głos słychać w bezpośrednim, nieco zadziornym języku i podpisach przy
linkach. Sekcje o podłączeniu istniejących kont, przeglądzie zmian i rozwidleniu
repozytorium zawierają rozpoznawalne działania programisty. Terminalowy fragment
dotyczy konkretnego repozytorium. Strona pokazuje także rekomendacje i liczby,
za które odpowiada jej właściciel.

Dla Lomi użyteczny jest ten związek języka z warsztatem odbiorcy. Nazwy paneli,
rzeczywiste repozytorium i ograniczenia platformowe są lepszym materiałem niż
ogólne obietnice. Wizualne krążenie logotypów agentów nie opisywałoby głównej
przewagi Lomi: układania całego projektu we wspólnej przestrzeni.

### Cap

[Strona źródłowa](https://cap.so/)

Cap ma jasną oprawę, chmury i łagodne przejścia kolorystyczne. To ważna
przeciwwaga dla uproszczonej zasady, że rozpoznawalna technologiczna strona
musi być ciemna. Duże pismo zestawiono z bardziej redakcyjnym tekstem opisowym.

W hero można wybrać tryb produktu. Poszczególne warianty mają własne wyjaśnienia
i demonstracje. Dalsza strona przechodzi przez nagrywanie, edycję, zrzuty ekranu,
rozumienie nagrań i przechowywanie. Zmieniają się skala oraz rodzaj materiału.
Chmury należą do tej samej tożsamości co produktowe ramy i przyciski.

Lomi przejmuje zasadę wyboru scenariusza, lecz osadza ją w swoim pulpicie.
W aktualnej wersji zrezygnowano z fotograficznej panoramy hero na rzecz sceny
narzędzi agentowych. Oryginalne chmury zachowano w repozytorium.

### Wave Terminal

[Strona źródłowa](https://www.waveterm.dev/)

Wave dobrze pokazuje pokrewne zadanie: rzeczywisty produkt łączy różne
powierzchnie pracy. Strona jasno komunikuje platformy i prowadzi do dużego
zrzutu aplikacji. Ciemna paleta, zielony akcent i oszczędna nawigacja są spójne.

Kompozycja pozostaje jednak klasyczna: centralny nagłówek, objaśnienie,
podsumowanie funkcji, duży ekran i zestawy kart. W badanym momencie nie
zaobserwowano aktywnego wideo ani animacji przeglądarkowych. To użyteczna
referencja dla wiarygodnego pokazania produktu, ale jej układ byłby zbyt bliski
problemowi wskazanemu przy pierwszej wersji Lomi.

Dla Lomi istotny jest czytelny widok współistniejących paneli. Zrzuty otrzymały
większą rolę i dostępne z klawiatury przełączniki, a lista narzędzi stała się
zwartym rejestrem zamiast serii kart.

### Warp

[Strona źródłowa](https://www.warp.dev/)

Obecny Warp przedstawia infrastrukturę dla procesów agentowych. To jasna,
techniczna strona z monospace, cienkimi liniami, podpisami figur, schematami
i nasyconymi stanami aktywnymi. Wielki diagram pod wprowadzeniem określa sposób
czytania reszty strony.

Najciekawsze jest objaśnianie działania przez stan interfejsu. W sekcji
konfiguracji wybór pozycji Agents zmienia drzewo plików, kod i opis. Ruch jest
powiązany z tematem pracy, choć strona ma też przewijane pasy i pulsujące stany.
Kolejne rozdziały zmieniają medium: diagram, kod, liczby, studium przypadku,
fotografia i warstwy architektury.

Lomi wykorzystuje sensowną reakcję na wybór użytkownika i zmianę tempa strony.
Monospace opisuje indeksy, narzędzia i metadane. Główne teksty zachowują
czytelny sans. Własna strona nie potrzebuje imitowanych zadań, liczników pracy
ani ruchu ciągłego, żeby pokazać techniczny produkt.

### Payload

[Strona źródłowa](https://payloadcms.com/)

Payload najmocniej różni się proporcjami. Wąska kolumna tekstu po lewej stoi
obok wielkich, nałożonych na siebie okien administracji, kodu i rezultatu.
Krawędzie wychodzą poza dostępny kadr. Pionowe podziały organizują kompozycję.

Tło hero jest zapętlonym wideo, a warstwy interfejsu pojawiają się z animacją.
Niżej odmiennie wykadrowane fragmenty produktu przechodzą w wybierane
zastosowania i kolejne prezentacje. Duża objętość wizualna służy pokazaniu
związku między tworzeniem aplikacji, zarządzaniem treścią i wynikiem.

Dla Lomi znaczenie mają odważne proporcje i powiązanie kilku narzędzi w jeden
obraz. Podgląd aplikacji zajmuje osobny, szeroki pas bezpośrednio pod hero.
Sekcje zmieniają gęstość i kontrast. Rozbudowany kolaż Payload zastąpiono jednym
czytelnym zrzutem naraz, aby użytkownik mógł rozpoznać konkretny stan projektu.

### Appllama i aktualny kierunek hero

[Strona źródłowa](https://appllama.io/)

Obejrzano hero w przeglądarce przy 1440 × 1000 i sprawdzono działające animacje.
Niewielkie obrazy produktów otaczają centralny tekst, korzystając z różnych
kątów, skali i ruchu. Środek pozostaje spokojny i czytelny. T3 stosuje podobną
zasadę z kilkoma rozpoznawalnymi znakami agentów. Najważniejsza jest przestrzeń
wokół komunikatu i związek materiału z produktem.

W Lomi sześć rzeczywistych narzędzi otacza nagłówek „Your agents. One home base.”.
Ich rozmieszczenie pozostaje stałe; osobne fazy i amplitudy delikatnego unoszenia
utrzymują czytelny środek. Karty wykorzystują React Bits TiltedCard do reakcji na
kursor. Bez JavaScriptu są widoczne i nieruchome. Przy ograniczonym ruchu oraz
po użyciu Pause motion wyłączone są unoszenie i przechylenie. Na telefonie
wszystkie znaki tworzą osobny pas nad treścią, zamiast wchodzić na tekst.

Po usunięciu Hermes Agent pozostało sześć kafelków z logo. Mają wspólną,
ciemną kolorystykę i prostą formę bez pasków z komendami. Tło nie zawiera
wycięcia terminala: lokalny ruch kursora wzbudza jasne komórki i rozchodzące
się, wygasające fale. Kształty zmieniają się na swoich miejscach w siatce.

Nazwy odnoszą się do klientów CLI, które Lomi rozpoznaje w `src/cli-agents.ts`
aplikacji desktopowej. Nie oznaczają osadzenia desktopowego Cursor czy
Antigravity. Opis ograniczeń platformowych pozostaje w FAQ.

### Coda i rozwijana nawigacja

[Strona źródłowa](https://www.coda.co/?ref=navbar.gallery)

Sprawdzono działającą stronę 19 października 2026 w Chrome, przy 1440 × 1000
i 390 × 844. To Coda zajmująca się płatnościami i dystrybucją, wskazana przez
Navbar Gallery. Na desktopie najechanie na Products rozwija całą białą,
zaokrągloną powierzchnię nawigacji. Trzy kolumny zawierają ikony, nazwy i krótkie
opisy, a tło strony zostaje rozmyte. Na telefonie Product zastępuje główną listę
widokiem szczegółowym z przyciskiem Back; logo i przycisk zamknięcia pozostają
na miejscu. Referencja ukrywa też pasek przy przewijaniu w dół i przywraca go
przy przewijaniu w górę.

Lomi zachowuje zaakceptowaną ciemną kapsułę i jej położenie nad hero. Product
rozwija z niej jeden szeroki panel z sześcioma odnośnikami w trzech grupach.
Roadmap, Devlog i Docs pozostają bezpośrednimi linkami. Ikony i krótkie opisy
pomagają wybrać sekcję. Na telefonie działa ten sam wzorzec Product → Back,
a długi panel przewija się wewnątrz dostępnej wysokości okna.

Obsługa Lomi obejmuje hover na precyzyjnym wskaźniku, kliknięcie, Enter i Space,
Escape, kliknięcie poza menu oraz wyjście fokusem. Zamykanie przy opuszczeniu
kursorem ma krótki margines czasu. Zamknięte linki znikają z kolejności Tab.
Przy ograniczonym ruchu panel pojawia się bez animacji. Bez JavaScriptu
pozostają natywne elementy details; pełnoekranowe przygaszenie włącza dopiero
kontroler JS, więc nie zasłania sekcji po przejściu do kotwicy.

Devlog jest osobną podstroną „Work in progress”, z aktywną pozycją nawigacji
i powrotem do strony głównej. Nie zawiera przykładowych wpisów ani dat.
Odnośniki sekcji z tej podstrony wskazują stronę główną z właściwą kotwicą.

## Wnioski z artykułów o AI slop

[Biegun.Studio](https://biegun.studio/jak-sprawic-by-tresci-z-ai-nie-wygladaly-jak-ai-slop)
trafnie rozdziela nawyki językowe od braku własnego materiału. Skrócenie zdań
nie wystarczy, jeśli tekst nadal pasuje do każdej firmy. W Lomi źródłem
opisu są konkretne funkcje, prawdziwe ekrany, repozytorium i wymagania platform.
Powtarzalne ikonki i jednakowe karty ustąpiły prezentacji pracy i rejestrom.

[Future Factors](https://futurefactors.ai/how-to-spot-ai-generated-writing-2026-professionals/)
zwraca uwagę na idealnie równoległe listy, ogólne przykłady i brak stanowiska.
Przydatnym kryterium jest informacyjność: zdanie powinno opisać sytuację
i działanie narzędzia. Progi dotyczące interpunkcji oraz liczby sygnałów są
heurystykami autora, a nie zweryfikowanym testem autorstwa.

[TH3 Design](https://www.th3design.co.uk/2025/08/how-to-spot-ai-generated-content/)
podkreśla spójność głosu, odbiorcy i poziomu formalności. Lomi mówi o plikach,
procesach i przeglądzie zmian, używając tego samego poziomu konkretu na całej
stronie. Naturalność nie wymaga dodawania błędów, losowej interpunkcji ani
wymuszonego humoru.

[We.Inc](https://we.inc/pl/blog/ai-slop-websites) wnosi kontrolę wiarygodności:
czy właściciel potrafi potwierdzić liczby, opinie i obietnice. W Lomi roadmapa
oddziela dostępną wersję od propozycji. Nie dodano cytatów użytkowników, gwiazdek,
wyników wydajności ani deklaracji o platformach bez materiału źródłowego.
Artykuł promuje także własny kreator; jego ocen konkurencji nie traktowano jako
niezależnego badania.

Te teksty nie uzasadniają zakazu kart, gradientów czy określonego fontu.
Same podane referencje często z nich korzystają. Kryterium dla Lomi stanowi
spójność decyzji z działaniem aplikacji i wartość informacji dla odwiedzającego.

## Decyzje wdrożone w Lomi

| Obszar | Decyzja | Znaczenie dla użytkownika |
| --- | --- | --- |
| Hero | Sześć unoszących się znaków CLI wokół centralnego tekstu, na ciemnym tle z limonkowym akcentem | Od pierwszego widoku wiadomo, dla kogo jest terminalowe ADE |
| Tło | Pełna siatka trójkątów, kół i kwadratów; jasne fale po ruchu kursora, inspirowane Shape Waves | Tło reaguje na ruch myszy bez zasłaniania treści ani przechwytywania kliknięć |
| Nawigacja | Zachowana ciemna kapsuła, rozwijany Product, bezpośrednie Roadmap / Devlog / Docs | Czytelny wybór sekcji i osobna przestrzeń na przyszłe wpisy |
| Demonstracja | Build / Preview / Review z prawdziwymi zrzutami | Wybór pokazuje zmianę rodzaju pracy w tym samym środowisku |
| Typografia | Geist dla treści, lokalny JetBrains Mono dla metadanych | Wyraźny podział między komunikatem a technicznym opisem |
| Kolor | Firmowe Chalk, Ink i Lime; ciemny rozdział narzędzi | Akcent wskazuje działanie, a kontrast rozdziela części opowieści |
| Funkcje | Numerowany rejestr zamiast sześciu kart | Szybkie porównanie narzędzi i ich zastosowania |
| Roadmapa | Przywrócona oś w trzech kolumnach, pionowa na telefonie | Czytelna różnica między wersją dostępną a propozycjami |
| Stopka | Pełne tło Lime, duże zaproszenie i grupy linków w jednym widoku | Wyraźne zakończenie strony, dopasowane do bieżącego rozmiaru okna |
| Tekst | Nazwy czynności, narzędzi i ograniczeń | Wiadomo, co sprawdzić przed instalacją |
| Ruch | Unoszenie kart, reakcja na kursor i falujące tło ze wspólną pauzą | Odbiorca może zatrzymać całą scenę, a treść pozostaje czytelna |
| Dostępność | Przyciski natywne, widoczny fokus, treść bez JS | Podgląd i nawigacja działają z klawiatury, a brak skryptów nie blokuje pobrania |
| CMS | Zachowany model Payload i opublikowane treści | Redesign nie usuwa edytowalnych sekcji ani wersji roboczych |

Stopka ma dokładną wysokość widoku (`100dvh` z zapasem zgodności `100vh`)
i pełną szerokość strony. W niskich oknach jej wnętrze może się przewijać,
dzięki czemu wszystkie odnośniki pozostają dostępne bez zwiększania wysokości
zewnętrznego elementu. Test przeglądarkowy sprawdza rozmiar po zmianach okna
i dostęp klawiaturą do każdego linku, również bez JavaScriptu.

Obietnice i wymagania produktu sprawdzono w `../lomi/README.md` i dokumentacji
projektu. Uniknięto absolutnej deklaracji o braku konta, ponieważ różne części
repozytorium opisują już funkcje logowania. Prywatność dotyczy lokalnego
przechowywania; połączenie z dostawcą AI nadal podlega politykom tego dostawcy.

Nowy lokalny zarys znajduje się w `content/landing.json`. Przed aktualizacją
lokalnej bazy CMS porównano jej opublikowaną i najnowszą roboczą treść ze starym
zarysem w Git. Obie były nieedytowane, więc zaktualizowano je do nowego tekstu.
Poprzednia treść pozostała w historii Payload. Zwykły powtórny seed nadal nie
nadpisuje istniejących treści. Edycje w panelu trafiają na stronę po przebudowie
z `CMS_URL`.
