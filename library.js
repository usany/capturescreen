function createBookCard(book, isFeatured = false) {
  const coverImg = book.cover ||
    "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22%3E%3Crect fill=%22%23666%22 width=%22300%22 height=%22400%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%23fff%22 font-size=%2216%22%3EBook Cover%3C/text%3E%3C/svg%3E";
  const cardClass = isFeatured ? "featured-book-card" : "book-card";
  return `
    <a class="${cardClass}" href="${book.url}" aria-label="${book.title}">
      <div class="card-cover" style="background-image: url('${coverImg}')"></div>
      <div class="card-info">
        <h2>${book.title}</h2>
        <p class="card-subtitle">${book.subtitle || ""}</p>
        <div class="card-meta">
          <span class="badge">${book.pages}p</span>
          <span class="badge style">${book.style || "Style"}</span>
          ${book.age ? `<span class="badge">${book.age}</span>` : ""}
        </div>
      </div>
    </a>
  `;
}

async function initLibrary() {
  const gridEl = document.getElementById("book-grid");
  const featuredGridEl = document.getElementById("featured-grid");
  const recentGridEl = document.getElementById("recent-grid");
  const featuredSectionEl = document.getElementById("featured-section");
  const recentSectionEl = document.getElementById("recent-section");
  const siteTitleEl = document.getElementById("site-title");
  const taglineEl = document.getElementById("tagline");
  const githubLinkEl = document.getElementById("github-link");
  const libraryStatsEl = document.getElementById("library-stats");

  let manifest = null;

  try {
    const res = await fetch("books/library.json");
    if (!res.ok) throw new Error("Failed to load manifest");
    manifest = await res.json();
  } catch (err) {
    console.error("Failed to load books/library.json:", err);
    // Fallback manifest with current book
    manifest = {
      library: {
        title: "달빛 도서관",
        tagline: "AI가 그린 동화책 모음",
        github: "https://github.com/revfactory/fairy-tale-moonlight-library",
      },
      books: [
        {
          id: "01-komi-firefly",
          title: "반딧불이 꼬미의 작은 불빛",
          subtitle: "가장 작은 빛이 가장 큰 용기가 되었어요",
          url: "books/01-komi-firefly/",
          cover: "books/01-komi-firefly/images/cover.png",
          pages: 8,
          style: "수채화",
          age: "4-7세",
          theme: "우정·용기",
          featured: true,
        },
      ],
    };
  }

  // Update header
  if (manifest.library) {
    if (manifest.library.title) {
      siteTitleEl.textContent = manifest.library.title;
      document.title = manifest.library.title;
    }
    if (manifest.library.tagline) {
      taglineEl.textContent = manifest.library.tagline;
    }
    if (manifest.library.github) {
      githubLinkEl.href = manifest.library.github;
    }
  }

  // Render books
  const books = manifest.books || [];

  if (books.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state">
        <h2>📚 아직 책이 없어요</h2>
        <p>첫 번째 동화책을 추가해 주세요!</p>
      </div>
    `;
    return;
  }

  // Separate featured and recent books
  const featured = books.filter((b) => b.featured).slice(0, 1);
  const recent = books.slice(0, 3);
  const all = books;

  // Render featured section
  if (featured.length > 0) {
    featuredSectionEl.style.display = "block";
    featuredGridEl.innerHTML = featured
      .map((book) => createBookCard(book, true))
      .join("");
  }

  // Render recent section
  if (books.length > 1) {
    recentSectionEl.style.display = "block";
    recentGridEl.innerHTML = recent
      .map((book) => createBookCard(book, false))
      .join("");
  }

  // Render all books
  gridEl.innerHTML = all
    .map((book) => createBookCard(book, false))
    .join("");

  // Update library stats
  const totalPages = books.reduce((sum, b) => sum + (b.pages || 0), 0);
  libraryStatsEl.textContent = `${books.length}권 · 총 ${totalPages}페이지`;
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLibrary);
} else {
  initLibrary();
}
