window.CANVAS_ENGINE = {
  // --- Canvas Waveform Drawing ---
  drawWaveform: function (trimOriginalBuffer, canvasElem, containerElem) {
    if (!trimOriginalBuffer) return;
    const ctx = canvasElem.getContext('2d');
    canvasElem.width = containerElem.clientWidth;
    canvasElem.height = containerElem.clientHeight;

    const width = canvasElem.width;
    const height = canvasElem.height;
    ctx.clearRect(0, 0, width, height);

    const data = trimOriginalBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.fillStyle = '#9ca3af';
    for (let i = 0; i < width; i++) {
      let min = 1.0; let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const yMin = (1 - min) * amp;
      const yMax = (1 - max) * amp;
      ctx.fillRect(i, yMax, 1, Math.max(1, yMin - yMax));
    }
  },

  // --- Rendering UI Board ---
  renderWordText: function (word, mainChar, isColorForced = false) {
    if (!word) return '';
    if (isColorForced) return `<span>${word}</span>`;
    if (mainChar.length > 1 && word.includes(mainChar)) {
      return word.split(mainChar).map((part, index) => {
        let html = ''; if (index > 0) html += `<span style="color: #dc2626; font-weight: bold;">${mainChar}</span>`;
        html += `<span>${part}</span>`; return html;
      }).join('');
    }
    const firstChar = mainChar.charAt(0); const charIndex = word.indexOf(firstChar);
    if (charIndex !== -1) { return `<span>${word.substring(0, charIndex)}</span><span style="color: #dc2626; font-weight: bold;">${firstChar}</span><span>${word.substring(charIndex + 1)}</span>`; }
    return `<span>${word}</span>`;
  },

  renderBoard: function (appState) {
    const { boardType, currentQuizMode, wrongAnswerCells, correctAnswerCell, quizConfig, playMode, currentTargetString, getNextTargetToken, quizInputTokens, quizHintActive, isRecordMode, currentRecordTarget, recordedAudio, audioModePref, handleCellClick, isMinigameActive, minigameTargetCells, handleMinigameClick } = appState;
    const container = document.getElementById('board-container');
    container.innerHTML = '';
    const activeData = boardType === 'seion' ? window.HIRAGANA_DATA.seionCells : window.HIRAGANA_DATA.dakuonCells;
    const maxCol = boardType === 'seion' ? 10 : 11;
    const maxRow = boardType === 'seion' ? 5 : 6;

    container.style.gridTemplateColumns = `repeat(${maxCol}, minmax(0, 1fr))`;
    container.style.gridTemplateRows = `repeat(${maxRow}, minmax(0, 1fr))`;

    // ★ ミニゲーム中のレンダリング
    if (isMinigameActive) {
      container.style.backgroundImage = "url('sp.png')";
      container.style.backgroundSize = "cover";
      container.style.backgroundPosition = "center";
      container.style.backgroundRepeat = "no-repeat";

      if (minigameTargetCells) {
        minigameTargetCells.forEach(cell => {
          const btn = document.createElement('button');
          btn.className = `relative hover:bg-white active:scale-95 transition-all overflow-hidden bg-orange-100 flex items-center justify-center animate-[bounce_1s_infinite]`;
          btn.style.gridColumn = cell.col; btn.style.gridRow = cell.row;
          btn.style.borderRadius = '50%';
          btn.style.border = '0.4cqw solid #f97316';
          btn.style.fontSize = '4.5cqw';
          btn.style.boxShadow = '0 0.4cqw 0 rgb(209,213,219)';
          btn.textContent = cell.emoji;
          if (handleMinigameClick) {
            btn.onclick = () => handleMinigameClick(cell);
          }
          container.appendChild(btn);
        });
      }
      return;
    } else {
      container.style.backgroundImage = "none";
    }

    let hintColStart = -1, hintColEnd = -1, hintRowStart = -1, hintRowEnd = -1;
    let targetCellInfo = null;

    if (currentQuizMode !== null && currentTargetString) {
      const config = quizConfig[`q${currentQuizMode}`];
      if (config.hint !== 'none') {
        if (playMode === 'name') {
          targetCellInfo = activeData.find(c => c.word === currentTargetString || c.char === currentTargetString);
        } else {
          const nextToken = getNextTargetToken(currentTargetString, quizInputTokens);
          if (nextToken) {
            targetCellInfo = activeData.find(c => c.char === nextToken || (c.char.includes(' ') && c.char.split(' ').includes(nextToken)));
          }
        }

        if (targetCellInfo) {
          const tc = targetCellInfo.col;
          const tr = targetCellInfo.row;

          if (config.hint === '1col') {
            hintColStart = tc; hintColEnd = tc + 1;
            hintRowStart = 1; hintRowEnd = maxRow + 1;
          } else if (config.hint === '3col') {
            // 枠がはみ出さない範囲での、取り得る colStart の最小・最大
            const minStart = Math.max(1, tc - 2);
            const maxPossibleStart = Math.min(maxCol - 2, tc);
            // ランダムにスタート位置を決定（答えが枠内のどこに来るかランダムになる）
            hintColStart = Math.floor(Math.random() * (maxPossibleStart - minStart + 1)) + minStart;
            hintColEnd = hintColStart + 3;
            hintRowStart = 1; hintRowEnd = maxRow + 1;
          } else if (config.hint === '1row') {
            hintColStart = 1; hintColEnd = maxCol + 1;
            hintRowStart = tr; hintRowEnd = tr + 1;
          } else if (config.hint === '3row') {
            hintColStart = 1; hintColEnd = maxCol + 1;
            // 枠がはみ出さない範囲での、取り得る rowStart の最小・最大
            const minStart = Math.max(1, tr - 2);
            const maxPossibleStart = Math.min(maxRow - 2, tr);
            // ランダムにスタート位置を決定
            hintRowStart = Math.floor(Math.random() * (maxPossibleStart - minStart + 1)) + minStart;
            hintRowEnd = hintRowStart + 3;
          }
        }
      }
    }

    activeData.forEach(cell => {
      const btn = document.createElement('button');

      const isWrong = wrongAnswerCells && wrongAnswerCells.has(cell.char);
      const isCorrect = correctAnswerCell === cell.char;

      let isHinted = false;
      if (appState.quizHintActive && hintColStart !== -1) {
        if (cell.col >= hintColStart && cell.col < hintColEnd && cell.row >= hintRowStart && cell.row < hintRowEnd) {
          isHinted = true;
        }
      }

      let btnBgClass = "bg-white";
      if (isWrong) {
        btnBgClass = "bg-gray-800 opacity-50 cursor-not-allowed";
      } else if (isCorrect) {
        btnBgClass = "bg-red-100";
      } else if (isHinted) {
        btnBgClass = "bg-pink-50";
      }

      const hoverClasses = isWrong ? "" : "hover:bg-gray-50 active:scale-95 transition-all";
      const transitionClass = isWrong ? "transition-none" : "transition-all";
      btn.className = `relative overflow-hidden ${hoverClasses} ${btnBgClass}`;
      btn.style.gridColumn = cell.col; btn.style.gridRow = cell.row;
      btn.style.borderRadius = '1cqw';

      if (isCorrect) {
        btn.style.border = '0.4cqw solid #ef4444';
      } else if (isHinted && !isWrong) {
        btn.style.border = '0.3cqw solid #f9a8d4';
      } else {
        btn.style.border = '0.2cqw solid #e5e7eb';
      }

      btn.style.containerType = 'size';
      btn.onclick = () => handleCellClick(cell);

      if (isRecordMode && currentRecordTarget && currentRecordTarget.char === cell.char) {
        btn.style.boxShadow = '0 0 0 0.4cqw #ef4444, 0 0.4cqw 0 rgb(209,213,219)'; btn.classList.add('bg-red-50');
      } else {
        btn.style.boxShadow = '0 0.4cqw 0 rgb(209,213,219)'; btn.classList.remove('bg-red-50');
      }

      const isOpacityTarget = isRecordMode && cell.char !== '、 。' && cell.char !== 'っ ー';
      let charOpacity = '1'; let nameOpacity = '1'; let charColor = '#2d3748'; let nameColor = '#4b5563'; let isNameColorForced = false;

      if (isOpacityTarget) {
        const charId = cell.char; const isCharRecorded = recordedAudio.has(charId); const charMode = audioModePref.get(charId) || 'sample';
        charOpacity = isCharRecorded ? '1' : '0.2'; if (charMode === 'sample') charColor = '#ca8a04';
        if (cell.word) {
          const nameId = cell.word; const isNameRecorded = recordedAudio.has(nameId); const nameMode = audioModePref.get(nameId) || 'sample';
          nameOpacity = isNameRecorded ? '1' : '0.2'; if (nameMode === 'sample') { nameColor = '#ca8a04'; isNameColorForced = true; }
        }
      }

      const colorBar = document.createElement('div');
      colorBar.className = isWrong ? 'bg-gray-900' : cell.color;
      colorBar.style.position = 'absolute'; colorBar.style.top = '0'; colorBar.style.left = '0'; colorBar.style.width = '100%'; colorBar.style.height = '8cqh';
      btn.appendChild(colorBar);

      const charDiv = document.createElement('div');
      charDiv.style.position = 'absolute'; charDiv.style.top = boardType === 'seion' ? '7cqh' : '54%';
      charDiv.style.right = boardType === 'seion' ? '1cqw' : 'auto'; charDiv.style.left = boardType === 'seion' ? 'auto' : '50%';
      charDiv.style.transform = boardType === 'seion' ? 'none' : 'translate(-50%, -50%)'; charDiv.style.width = '100%'; charDiv.style.height = '92%';

      if (cell.char === '、 。' || cell.char === 'っ ー') {
        const parts = cell.char.split(' '); charDiv.style.top = '8cqh'; charDiv.style.left = '0'; charDiv.style.transform = 'none';
        charDiv.innerHTML = `
          <svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;"><line x1="100%" y1="0%" x2="0%" y2="100%" stroke="#9ca3af" stroke-width="0.5cqw" /></svg>
          <div style="position:absolute; top:12%; left:12%; font-size:45cqw; font-weight:900; color:#2d3748; line-height:1;">${parts[0]}</div>
          <div style="position:absolute; bottom:12%; right:12%; font-size:45cqw; font-weight:900; color:#2d3748; line-height:1;">${parts[1]}</div>`;
      } else {
        charDiv.style.fontSize = cell.char.length > 1 ? (boardType === 'seion' ? '38cqw' : '48cqw') : (boardType === 'seion' ? '58cqw' : '65cqw');
        charDiv.style.fontWeight = '900';
        charDiv.style.color = isWrong ? '#6b7280' : ((boardType === 'seion' && playMode === 'name' && cell.char.length === 1) ? '#d1d5db' : charColor);
        charDiv.style.lineHeight = '1'; charDiv.style.letterSpacing = '-0.05em'; charDiv.style.zIndex = '0'; charDiv.style.whiteSpace = 'nowrap';
        charDiv.style.display = 'flex'; charDiv.style.alignItems = boardType === 'seion' ? 'flex-start' : 'center';
        charDiv.style.justifyContent = boardType === 'seion' ? 'flex-end' : 'center'; charDiv.style.paddingRight = boardType === 'seion' ? '1cqw' : '0';
        charDiv.textContent = cell.char;
      }
      charDiv.style.opacity = charOpacity;
      btn.appendChild(charDiv);

      if (cell.svgType) {
        const svgDiv = document.createElement('div'); svgDiv.style.position = 'absolute'; svgDiv.style.bottom = '12cqh'; svgDiv.style.left = '-4cqw';
        svgDiv.style.width = '65cqw'; svgDiv.style.height = '65cqw'; svgDiv.style.zIndex = '10';
        svgDiv.style.opacity = nameOpacity;
        svgDiv.innerHTML = window.HIRAGANA_DATA.getCustomSVG(cell.svgType); btn.appendChild(svgDiv);
      } else if (cell.emoji) {
        const emojiDiv = document.createElement('div');
        if (window.HIRAGANA_DATA.photoEmojis.includes(cell.emoji)) {
          emojiDiv.style.position = 'absolute'; emojiDiv.style.bottom = '22cqh'; emojiDiv.style.left = '4cqw';
          emojiDiv.style.width = '42cqw'; emojiDiv.style.height = '42cqw'; emojiDiv.style.backgroundColor = 'white';
          emojiDiv.style.border = '0.2cqw solid #d1d5db'; emojiDiv.style.boxShadow = '0 0.4cqw 0.8cqw rgba(0,0,0,0.15)';
          emojiDiv.style.display = 'flex'; emojiDiv.style.alignItems = 'center'; emojiDiv.style.justifyContent = 'center'; emojiDiv.style.zIndex = '10';
          emojiDiv.innerHTML = `<div style="font-size: 34cqw; line-height: 1;">${cell.emoji}</div>`;
        } else {
          emojiDiv.style.position = 'absolute'; emojiDiv.style.bottom = '20cqh'; emojiDiv.style.left = '4cqw';
          emojiDiv.style.fontSize = '42cqw'; emojiDiv.style.lineHeight = '1'; emojiDiv.style.filter = 'drop-shadow(0.2cqw 0.2cqw 0.2cqw rgba(0,0,0,0.25))';
          emojiDiv.style.zIndex = '10'; emojiDiv.textContent = cell.emoji;
        }
        emojiDiv.style.opacity = nameOpacity;
        btn.appendChild(emojiDiv);
      }

      if (cell.word) {
        const wordDiv = document.createElement('div'); wordDiv.style.position = 'absolute'; wordDiv.style.bottom = '3cqh'; wordDiv.style.left = '0';
        wordDiv.style.width = '100%'; wordDiv.style.textAlign = 'center'; wordDiv.style.fontSize = '15cqw'; wordDiv.style.fontWeight = '800';
        wordDiv.style.color = isWrong ? '#6b7280' : nameColor;
        wordDiv.style.lineHeight = '1'; wordDiv.style.whiteSpace = 'nowrap'; wordDiv.style.overflow = 'hidden';
        wordDiv.style.textOverflow = 'ellipsis'; wordDiv.style.zIndex = '20';
        wordDiv.innerHTML = window.CANVAS_ENGINE.renderWordText(cell.word, cell.char, isNameColorForced);
        wordDiv.style.opacity = nameOpacity;
        btn.appendChild(wordDiv);
      }
      container.appendChild(btn);
    });

    if (appState.quizHintActive && hintColStart !== -1) {
      const hintDiv = document.createElement('div');
      hintDiv.style.pointerEvents = 'none';
      hintDiv.style.border = '0.4cqw solid #f472b6';
      hintDiv.style.borderRadius = '1.5cqw';
      hintDiv.style.zIndex = '5';
      hintDiv.style.boxShadow = '0 0 1cqw rgba(244, 114, 182, 0.8), inset 0 0 0.5cqw rgba(244, 114, 182, 0.5)';
      hintDiv.style.gridColumn = `${hintColStart} / ${hintColEnd}`;
      hintDiv.style.gridRow = `${hintRowStart} / ${hintRowEnd}`;
      hintDiv.style.margin = '-0.4cqw';
      container.appendChild(hintDiv);
    }
  }
};
