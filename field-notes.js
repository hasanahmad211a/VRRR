// The introduction works independently of data and third-party chart libraries.
const notes = {
  fire: ['The first clue is seen from space.', 'MODIS and VIIRS detect heat. A detection tells us a satellite saw a hot spot — it is not a count of distinct wildfires or a direct measure of area burned.'],
  air: ['Smoke doesn’t stay inside a border.', 'Aerosol optical depth (AOD) describes how particles affect light through the atmosphere. It can help trace smoke, but it is not the same as the air pollution someone breathes at ground level.'],
  water: ['The river is where the story gets complicated.', 'After a fire, rain can move sediment and nutrients into rivers. Water temperature and water-quality measurements help investigate the response. The effect depends on the basin, weather, timing, and available observations.'],
  salmon: ['A fishery is more than a number.', 'Salmon connect rivers, oceans, and livelihoods. Fishery value and catch can help describe what is at stake, but they also reflect fishing pressure, ocean conditions, and many other influences. A shared trend alone cannot prove a wildfire effect.'],
};
const panel = document.getElementById('pathway-note');
const buttons = [...document.querySelectorAll('.pathway-step')];
buttons.forEach((button, index) => {
  button.addEventListener('click', () => {
    buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    const [title, text] = notes[button.dataset.step];
    const strong = document.createElement('b'); strong.textContent = title;
    const paragraph = document.createElement('p'); paragraph.textContent = text;
    panel.replaceChildren(strong, paragraph);
  });
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); buttons[next].click();
  });
});
